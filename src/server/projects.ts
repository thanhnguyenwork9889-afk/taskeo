import "server-only";
import { activityRows } from "@/domain/activity-record";
import { dueDateToDb, projectFromRecord, type ProjectRecord } from "@/domain/project-record";
import type { Project, ProjectStatus } from "@/domain/types";
import type { CreateProjectInput, UpdateProjectInput } from "@/domain/validation";
import { prisma } from "@/server/db";
import { provisionProjectFolder, provisionSpaceFolder } from "@/server/google/drive-provision";

// Chỉ đọc các cột `ProjectRecord` cần; không trả userId, order, driveFolderId, createdAt.
const projectSelect = {
  id: true,
  spaceId: true,
  name: true,
  description: true,
  status: true,
  dueDate: true,
} as const;

/** Số dự án tối đa trong một không gian: `createProject` chặn ở đây, `listProjects` cắt ở đây. */
export const MAX_PROJECTS_PER_SPACE = 200;

export type CreateProjectResult =
  | { ok: true; project: Project }
  | { ok: false; reason: "not_found" | "conflict" | "limit" };

export type UpdateProjectResult = { ok: true; project: Project } | { ok: false; reason: "not_found" | "conflict" };

interface ProjectFieldsData {
  name?: string;
  description?: string | null;
  status?: ProjectStatus;
  dueDate?: Date | null;
}

/** Mô tả rỗng (schema đã trim) lưu `null`, để DB chỉ có một kiểu "không có mô tả". */
function descriptionToDb(description: string | undefined): string | null {
  return description ? description : null;
}

/**
 * Chỉ giữ trường cho phép sửa và có mặt trong input (không gửi `undefined`, bỏ khoá lạ).
 * `description: ""` → `null`; `dueDate` qua `dueDateToDb` (null giữ null).
 */
function pickProjectFields(input: UpdateProjectInput): ProjectFieldsData {
  const { name, description, status, dueDate } = input;
  return {
    ...(name !== undefined && { name }),
    ...(description !== undefined && { description: descriptionToDb(description) }),
    ...(status !== undefined && { status }),
    ...(dueDate !== undefined && { dueDate: dueDateToDb(dueDate) }),
  };
}

/** Lỗi vi phạm unique của Prisma (`P2002`); kiểm `code` để không phải import lớp lỗi của Prisma. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

async function spaceBelongsToUser(userId: string, spaceId: string): Promise<boolean> {
  const space = await prisma.space.findFirst({ where: { id: spaceId, userId }, select: { id: true } });
  return space !== null;
}

/** Không gian của người dùng kèm tên / thư mục Drive (cho `provisionAndSaveFolders`); `null` khi không có. */
function findOwnedSpace(
  userId: string,
  spaceId: string,
): Promise<{ id: string; name: string; driveFolderId: string | null } | null> {
  return prisma.space.findFirst({
    where: { id: spaceId, userId },
    select: { id: true, name: true, driveFolderId: true },
  });
}

type DriveLogContext = { userId: string; spaceId: string; projectId: string };

/** Log lỗi DB phần Drive: chỉ tên lỗi, không `message` (có thể chứa dữ liệu / chi tiết Prisma). */
function logDriveDbError(message: string, logContext: DriveLogContext, error: unknown): void {
  console.error(message, { ...logContext, error: error instanceof Error ? error.name : "unknown" });
}

/**
 * Ghi một id thư mục Drive (best-effort): lỗi chỉ log an toàn và không ném — dự án đã tạo xong,
 * Drive chỉ là phần phụ.
 */
async function saveDriveFolderId(write: () => Promise<unknown>, logContext: DriveLogContext): Promise<void> {
  try {
    await write();
  } catch (error) {
    logDriveDbError("[projects] Không lưu được driveFolderId", logContext, error);
  }
}

/**
 * Thư mục cha cho thư mục dự án. Không gian chưa có thư mục → tạo bù, ghi có điều kiện
 * (`driveFolderId: null`, không đè id ghi đồng thời) rồi đọc lại id đã lưu: request thua cuộc đua
 * dùng thư mục của request thắng (thư mục của nó thành thư mục rỗng mồ côi — chấp nhận), để
 * `Project.driveFolderId` luôn nằm trong thư mục mà `Space.driveFolderId` trỏ tới.
 * `null` khi không có thư mục, đọc lại lỗi hoặc không gian đã bị xoá.
 */
async function resolveSpaceFolderId(
  userId: string,
  space: { id: string; name: string; driveFolderId: string | null },
  logContext: DriveLogContext,
): Promise<string | null> {
  if (space.driveFolderId) return space.driveFolderId;
  const created = await provisionSpaceFolder(userId, { id: space.id, name: space.name });
  if (!created) return null;
  await saveDriveFolderId(
    () =>
      prisma.space.updateMany({
        where: { id: space.id, userId, driveFolderId: null },
        data: { driveFolderId: created },
      }),
    logContext,
  );
  try {
    const stored = await prisma.space.findFirst({
      where: { id: space.id, userId },
      select: { driveFolderId: true },
    });
    return stored?.driveFolderId ?? null;
  } catch (error) {
    logDriveDbError("[projects] Không đọc lại được driveFolderId của không gian", logContext, error);
    return null;
  }
}

/**
 * Tạo thư mục Drive cho dự án vừa tạo (trong thư mục không gian) rồi lưu id. Các hàm
 * `provision*` không ném; lỗi DB chỉ log — không làm hỏng kết quả tạo dự án.
 */
async function provisionAndSaveFolders(
  userId: string,
  space: { id: string; name: string; driveFolderId: string | null },
  project: { id: string; name: string },
): Promise<void> {
  const logContext = { userId, spaceId: space.id, projectId: project.id };
  const parentFolderId = await resolveSpaceFolderId(userId, space, logContext);
  if (!parentFolderId) return;
  const projectFolderId = await provisionProjectFolder(userId, { spaceId: space.id, parentFolderId, project });
  if (!projectFolderId) return;
  await saveDriveFolderId(
    () =>
      prisma.project.updateMany({
        where: { id: project.id, userId },
        data: { driveFolderId: projectFolderId },
      }),
    logContext,
  );
}

/**
 * Thoát ký tự đại diện của LIKE/ILIKE để so khớp nguyên văn. Thoát `\` trước, nếu không
 * `\` vừa thêm cho `%`/`_` sẽ bị nhân đôi. `\` là ký tự escape mặc định của ILIKE trên Postgres.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/** Có dự án khác cùng tên (không phân biệt hoa thường) trong không gian; DB unique thì phân biệt. */
async function nameTaken(userId: string, spaceId: string, name: string, excludeId?: string): Promise<boolean> {
  const duplicate = await prisma.project.findFirst({
    where: {
      userId,
      spaceId,
      // Prisma dịch `equals` + `mode: "insensitive"` thành `"name" ILIKE $n` và KHÔNG thoát
      // giá trị (đã kiểm bằng log SQL), nên `_`/`%` trong tên thành ký tự đại diện
      // (`Q1_plan` khớp `Q1xplan`, `%` khớp mọi tên → 409 sai). Tự thoát trước khi truyền.
      name: { equals: escapeLikePattern(name), mode: "insensitive" },
      ...(excludeId !== undefined && { NOT: { id: excludeId } }),
    },
    select: { id: true },
  });
  return duplicate !== null;
}

/** Dự án của không gian; `null` khi không gian không có hoặc của người khác. */
export async function listProjects(userId: string, spaceId: string): Promise<Project[] | null> {
  if (!(await spaceBelongsToUser(userId, spaceId))) return null;
  const records = await prisma.project.findMany({
    where: { userId, spaceId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: projectSelect,
    take: MAX_PROJECTS_PER_SPACE,
  });
  return records.map(projectFromRecord);
}

export async function getProject(userId: string, id: string): Promise<Project | null> {
  const record = await prisma.project.findFirst({ where: { id, userId }, select: projectSelect });
  return record ? projectFromRecord(record) : null;
}

/**
 * Tạo dự án trong không gian của người dùng; không gian lạ / đủ giới hạn / trùng tên → `ok: false`.
 * Dự án và activity `project_created` (createdAt = `now`) ghi trong cùng một transaction.
 */
export async function createProject(
  userId: string,
  spaceId: string,
  input: CreateProjectInput,
  now: Date = new Date(),
): Promise<CreateProjectResult> {
  const space = await findOwnedSpace(userId, spaceId);
  if (!space) return { ok: false, reason: "not_found" };
  // count / aggregate rồi create không atomic: hai POST đồng thời có thể cùng `order` (max + 1)
  // hoặc vượt MAX_PROJECTS_PER_SPACE một chút. Chấp nhận vì `order` chỉ dùng để sắp xếp
  // (listProjects sắp tiếp theo createdAt). Dùng max + 1 thay cho count để không trùng sau khi xoá.
  const count = await prisma.project.count({ where: { userId, spaceId } });
  if (count >= MAX_PROJECTS_PER_SPACE) return { ok: false, reason: "limit" };
  if (await nameTaken(userId, spaceId, input.name)) return { ok: false, reason: "conflict" };
  const { _max } = await prisma.project.aggregate({ where: { userId, spaceId }, _max: { order: true } });
  const order = _max.order === null ? 0 : _max.order + 1;

  let record: ProjectRecord;
  try {
    // Interactive transaction: activity cần id dự án vừa tạo làm `entityId`. Trong callback chỉ
    // gọi `tx.*`; lỗi ném ra khiến Prisma rollback rồi ném lại lỗi gốc (còn `code`) ra ngoài.
    record = await prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          userId,
          spaceId,
          name: input.name,
          description: descriptionToDb(input.description),
          ...(input.status !== undefined && { status: input.status }),
          ...(input.dueDate !== undefined && { dueDate: dueDateToDb(input.dueDate) }),
          order,
        },
        select: projectSelect,
      });
      await tx.activity.createMany({ data: activityRows(userId, created.id, ["project_created"], now) });
      return created;
    });
  } catch (error) {
    // Hai request đồng thời cùng tên vượt qua bước kiểm trước → unique `[spaceId, name]` chặn.
    if (isUniqueViolation(error)) return { ok: false, reason: "conflict" };
    throw error;
  }

  // Ngoài try/catch ở trên: lỗi khi ghi id thư mục không được hiểu nhầm thành P2002 → conflict.
  await provisionAndSaveFolders(userId, space, { id: record.id, name: record.name });
  return { ok: true, project: projectFromRecord(record) };
}

/** Sửa các trường gửi lên; dự án lạ → `not_found`, đổi tên trùng trong không gian → `conflict`. */
export async function updateProject(
  userId: string,
  id: string,
  input: UpdateProjectInput,
): Promise<UpdateProjectResult> {
  const current = await prisma.project.findFirst({ where: { id, userId }, select: { spaceId: true } });
  if (!current) return { ok: false, reason: "not_found" };
  if (input.name !== undefined && (await nameTaken(userId, current.spaceId, input.name, id))) {
    return { ok: false, reason: "conflict" };
  }

  try {
    const { count } = await prisma.project.updateMany({ where: { id, userId }, data: pickProjectFields(input) });
    if (count === 0) return { ok: false, reason: "not_found" };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: "conflict" };
    throw error;
  }

  const project = await getProject(userId, id);
  return project ? { ok: true, project } : { ok: false, reason: "not_found" };
}

/** Xoá dự án của người dùng; công việc giữ lại với `projectId = null` (`onDelete: SetNull`). */
export async function deleteProject(userId: string, id: string): Promise<boolean> {
  const { count } = await prisma.project.deleteMany({ where: { id, userId } });
  return count > 0;
}
