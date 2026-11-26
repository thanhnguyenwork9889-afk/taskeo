import "server-only";
import { activityRows, taskActivityTypes } from "@/domain/activity-record";
import { dueDateToDb } from "@/domain/project-record";
import { completedAtFor } from "@/domain/task-completion";
import { taskFromRecord } from "@/domain/task-record";
import type { Priority, Task, TaskStatus } from "@/domain/types";
import type { CreateTaskInput, ListTasksQuery, UpdateTaskInput } from "@/domain/validation";
import { prisma } from "@/server/db";

// Chỉ đọc các cột `TaskRecord` cần; không trả userId, order.
const taskSelect = {
  id: true,
  spaceId: true,
  projectId: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  dueDate: true,
  completedAt: true,
  calendarEventId: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Số công việc tối đa của một người dùng: `createTask` chặn ở đây, `listTasks` cắt ở đây. */
export const MAX_TASKS_PER_USER = 2000;

export type CreateTaskResult =
  | { ok: true; task: Task }
  | { ok: false; reason: "invalid_project" | "invalid_space" | "space_mismatch" | "limit" };

export type UpdateTaskResult = { ok: true; task: Task } | { ok: false; reason: "not_found" | "invalid_project" };

interface TaskFieldsData {
  title?: string;
  description?: string | null;
  priority?: Priority;
  dueDate?: Date | null;
}

interface TaskUpdateData extends TaskFieldsData {
  status?: TaskStatus;
  completedAt?: Date | null;
  projectId?: string | null;
  spaceId?: string;
}

type PlacementResult =
  | { ok: true; spaceId: string | null; projectId: string | null }
  | { ok: false; reason: "invalid_project" | "invalid_space" | "space_mismatch" };

/** Mô tả rỗng (schema đã trim) lưu `null`, để DB chỉ có một kiểu "không có mô tả". */
function descriptionToDb(description: string | undefined): string | null {
  return description ? description : null;
}

/** Chỉ giữ các trường thường có mặt trong input (không gửi `undefined`, bỏ khoá lạ). */
function pickTaskFields(input: UpdateTaskInput): TaskFieldsData {
  const { title, description, priority, dueDate } = input;
  return {
    ...(title !== undefined && { title }),
    ...(description !== undefined && { description: descriptionToDb(description) }),
    ...(priority !== undefined && { priority }),
    ...(dueDate !== undefined && { dueDate: dueDateToDb(dueDate) }),
  };
}

/** Lỗi khoá ngoại của Prisma (`P2003`); kiểm `code` để không phải import lớp lỗi của Prisma. */
function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2003";
}

/** Không gian của dự án nếu dự án thuộc người dùng; `null` khi không có hoặc của người khác. */
async function projectSpaceId(userId: string, projectId: string): Promise<{ spaceId: string } | null> {
  return prisma.project.findFirst({ where: { id: projectId, userId }, select: { spaceId: true } });
}

async function spaceBelongsToUser(userId: string, spaceId: string): Promise<boolean> {
  const space = await prisma.space.findFirst({ where: { id: spaceId, userId }, select: { id: true } });
  return space !== null;
}

/**
 * Xác định không gian / dự án khi tạo: có dự án → không gian theo dự án (gửi `spaceId` khác → lỗi);
 * chỉ có không gian → phải của người dùng; không có cả hai → cả hai `null` (như demo).
 */
async function resolvePlacement(userId: string, input: CreateTaskInput): Promise<PlacementResult> {
  const { projectId, spaceId } = input;
  if (typeof projectId === "string") {
    const project = await projectSpaceId(userId, projectId);
    if (!project) return { ok: false, reason: "invalid_project" };
    if (typeof spaceId === "string" && spaceId !== project.spaceId) return { ok: false, reason: "space_mismatch" };
    return { ok: true, spaceId: project.spaceId, projectId };
  }
  if (typeof spaceId === "string") {
    if (!(await spaceBelongsToUser(userId, spaceId))) return { ok: false, reason: "invalid_space" };
    return { ok: true, spaceId, projectId: null };
  }
  return { ok: true, spaceId: null, projectId: null };
}

/** Công việc của người dùng theo bộ lọc; không gian / dự án của người khác tự ra `[]`. */
export async function listTasks(userId: string, filter: ListTasksQuery): Promise<Task[]> {
  const { spaceId, projectId, status } = filter;
  const records = await prisma.task.findMany({
    where: {
      userId,
      ...(spaceId !== undefined && { spaceId }),
      ...(projectId !== undefined && { projectId }),
      ...(status !== undefined && { status }),
    },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: taskSelect,
    take: MAX_TASKS_PER_USER,
  });
  return records.map(taskFromRecord);
}

export async function getTask(userId: string, id: string): Promise<Task | null> {
  const record = await prisma.task.findFirst({ where: { id, userId }, select: taskSelect });
  return record ? taskFromRecord(record) : null;
}

/** Tạo công việc; dự án / không gian lạ, lệch không gian hoặc đủ giới hạn → `ok: false`. */
export async function createTask(userId: string, input: CreateTaskInput, now: Date = new Date()): Promise<CreateTaskResult> {
  const placement = await resolvePlacement(userId, input);
  if (!placement.ok) return placement;

  // Kiểm sở hữu → count → aggregate → create không atomic: hai POST đồng thời có thể vượt
  // MAX_TASKS_PER_USER một chút hoặc trùng `order` (listTasks sắp tiếp theo createdAt) — chấp nhận.
  // Dự án / không gian bị xoá sau bước kiểm → khoá ngoại báo P2003, bắt bên dưới.
  const count = await prisma.task.count({ where: { userId } });
  if (count >= MAX_TASKS_PER_USER) return { ok: false, reason: "limit" };
  const { _max } = await prisma.task.aggregate({ where: { userId }, _max: { order: true } });
  const order = _max.order === null ? 0 : _max.order + 1;

  try {
    // Interactive transaction: activity cần id công việc vừa tạo làm `entityId`. Trong callback chỉ
    // gọi `tx.*`; lỗi ném ra khiến Prisma rollback rồi ném lại lỗi gốc (còn `code`) ra ngoài.
    const record = await prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          userId,
          spaceId: placement.spaceId,
          projectId: placement.projectId,
          title: input.title,
          description: descriptionToDb(input.description),
          ...(input.status !== undefined && { status: input.status }),
          ...(input.priority !== undefined && { priority: input.priority }),
          ...(input.dueDate !== undefined && { dueDate: dueDateToDb(input.dueDate) }),
          completedAt: completedAtFor<Date>("TODO", null, input.status ?? "TODO", now),
          order,
        },
        select: taskSelect,
      });
      await tx.activity.createMany({
        data: activityRows(userId, created.id, taskActivityTypes(null, input.status), now),
      });
      return created;
    });
    return { ok: true, task: taskFromRecord(record) };
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      return { ok: false, reason: placement.projectId !== null ? "invalid_project" : "invalid_space" };
    }
    throw error;
  }
}

/**
 * Sửa các trường gửi lên trong MỘT `updateMany`. Đổi `projectId` → `spaceId` theo dự án;
 * `projectId: null` → rời dự án, giữ `spaceId`. `completedAt` chỉ đổi khi `status` gửi lên khác status hiện tại.
 */
export async function updateTask(
  userId: string,
  id: string,
  input: UpdateTaskInput,
  now: Date = new Date(),
): Promise<UpdateTaskResult> {
  // Đọc status rồi ghi completedAt không atomic: hai PATCH đồng thời có thể tính completedAt
  // từ cùng trạng thái cũ — chấp nhận (chỉ lệch mốc hoàn thành).
  const current = await prisma.task.findFirst({ where: { id, userId }, select: { status: true, completedAt: true } });
  if (!current) return { ok: false, reason: "not_found" };

  let data: TaskUpdateData = pickTaskFields(input);
  if (typeof input.projectId === "string") {
    const project = await projectSpaceId(userId, input.projectId);
    if (!project) return { ok: false, reason: "invalid_project" };
    data = { ...data, projectId: input.projectId, spaceId: project.spaceId };
  } else if (input.projectId === null) {
    data = { ...data, projectId: null };
  }
  // Status gửi lên trùng status hiện tại → không ghi status / completedAt (giữ mốc hoàn thành).
  if (input.status !== undefined && input.status !== current.status) {
    const completedAt = completedAtFor<Date>(current.status, current.completedAt, input.status, now);
    data = { ...data, status: input.status, completedAt };
  }

  // Chỉ ghi activity khi status thực sự được ghi (DONE → DONE đã bị bỏ ở trên).
  const activityTypes = data.status !== undefined ? taskActivityTypes(current.status, data.status) : [];

  // Không có gì để ghi (vd chỉ gửi status như cũ): bỏ qua updateMany (và transaction) để không phụ thuộc
  // cách Prisma xử lý `data: {}` (count, @updatedAt); getTask bên dưới vẫn trả not_found nếu bị xoá giữa chừng.
  if (Object.keys(data).length > 0) {
    try {
      // Trong callback chỉ gọi `tx.*`; count 0 → thoát trước khi ghi activity.
      const updated = await prisma.$transaction(async (tx) => {
        const { count } = await tx.task.updateMany({ where: { id, userId }, data });
        if (count === 0) return false;
        if (activityTypes.length > 0) {
          await tx.activity.createMany({ data: activityRows(userId, id, activityTypes, now) });
        }
        return true;
      });
      if (!updated) return { ok: false, reason: "not_found" };
    } catch (error) {
      // Dự án bị xoá giữa bước kiểm và bước ghi → khoá ngoại báo P2003.
      if (isForeignKeyViolation(error)) return { ok: false, reason: "invalid_project" };
      throw error;
    }
  }

  const task = await getTask(userId, id);
  return task ? { ok: true, task } : { ok: false, reason: "not_found" };
}

/** Xoá công việc của người dùng; `false` khi không có hoặc của người khác. */
export async function deleteTask(userId: string, id: string): Promise<boolean> {
  const { count } = await prisma.task.deleteMany({ where: { id, userId } });
  return count > 0;
}
