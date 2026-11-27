import "server-only";
import {
  buildDriveFilesQuery,
  buildFolderIndex,
  chunk,
  DRIVE_PARENTS_PER_QUERY,
  mergeRecent,
  toDriveFileItem,
  toDriveFileName,
} from "@/domain/drive-files";
import type { DocKind, DriveFileItem } from "@/domain/types";
import { FILE_LIST_MAX, type CreateFileInput } from "@/domain/validation";
import { prisma } from "@/server/db";
import { ensureProjectFolderId, ensureSpaceFolderId } from "@/server/drive-folder-sync";
import { createDriveFile, listDriveFiles } from "@/server/google/drive-files";
import { hasGoogleScope } from "@/server/google/granted-scopes";
import { GOOGLE_SCOPES } from "@/server/google/scopes";
import { MAX_PROJECTS_PER_SPACE } from "@/server/projects";
import { MAX_SPACES } from "@/server/spaces";

// Phạm vi nạp: module này chỉ được `GET` / `POST /api/files` import động sau khi đã có phiên (chế độ
// `configured`), nên chế độ demo không bao giờ nạp `@/server/google/drive-files` / Prisma.

export interface ListFilesParams {
  spaceId?: string;
  projectId?: string;
  kind?: DocKind;
  limit: number;
}

export type ListFilesResult =
  | { ok: true; files: DriveFileItem[] }
  | { ok: false; reason: "not_found" | "drive_not_connected" | "drive_error" };

export interface ListFilesDeps {
  listDriveFiles: typeof listDriveFiles;
}

const defaultDeps: ListFilesDeps = { listDriveFiles };

/** Kế hoạch gọi Drive: thư mục được phép (index) + các chuỗi `q` + `pageSize` mỗi `q`. */
interface DrivePlan {
  index: ReturnType<typeof buildFolderIndex>;
  queries: string[];
  pageSize: number;
}

const projectSelect = { id: true, name: true, driveFolderId: true } as const;

/** Lọc thêm userId: dự án luôn thuộc không gian của chính user, nhưng không dựa vào điều đó. */
function scopedProjects(userId: string) {
  return { where: { userId }, take: MAX_PROJECTS_PER_SPACE, select: projectSelect };
}

/**
 * Chọn phạm vi thư mục theo bộ lọc, chỉ truy vấn đúng phần bộ lọc cần; `null` khi `spaceId` /
 * `projectId` không thuộc user. Index chỉ gồm thư mục trong phạm vi lọc, nên file có nhiều cha vẫn
 * không lọt ra ngoài phạm vi.
 */
async function planDriveQuery(userId: string, params: ListFilesParams): Promise<DrivePlan | null> {
  const { spaceId, projectId, kind, limit } = params;

  if (projectId) {
    const project = await prisma.project.findFirst({
      // Dự án lẫn không gian chứa nó đều phải thuộc user.
      where: { id: projectId, userId, space: { userId } },
      select: { ...projectSelect, space: { select: { id: true, name: true } } },
    });
    if (!project) return null;
    const { space, ...folder } = project;
    // Chỉ thư mục dự án: file nằm thẳng trong thư mục không gian không thuộc phạm vi dự án.
    const index = buildFolderIndex([{ ...space, driveFolderId: null, projects: [folder] }]);
    return { index, queries: parentQueries(index, kind), pageSize: limit };
  }

  if (spaceId) {
    const space = await prisma.space.findFirst({
      where: { id: spaceId, userId },
      select: { ...projectSelect, projects: scopedProjects(userId) },
    });
    if (!space) return null;
    const index = buildFolderIndex([space]);
    return { index, queries: parentQueries(index, kind), pageSize: limit };
  }

  // Không lọc: `q` không kèm parents (hàng trăm thư mục không vừa một `q`); lấy FILE_LIST_MAX file
  // mới nhất rồi giữ file nằm trong thư mục của user qua index.
  const spaces = await prisma.space.findMany({
    where: { userId },
    take: MAX_SPACES,
    select: { ...projectSelect, projects: scopedProjects(userId) },
  });
  const index = buildFolderIndex(spaces);
  const queries = index.size === 0 ? [] : [buildDriveFilesQuery({ kind })];
  return { index, queries, pageSize: FILE_LIST_MAX };
}

/** Một `q` cho mỗi khối DRIVE_PARENTS_PER_QUERY thư mục; không có thư mục → không `q` nào. */
function parentQueries(index: ReadonlyMap<string, unknown>, kind?: DocKind): string[] {
  return chunk([...index.keys()], DRIVE_PARENTS_PER_QUERY).map((parentIds) =>
    buildDriveFilesQuery({ kind, parentIds }),
  );
}

/**
 * File Google Docs / Sheets / Slides trong thư mục Drive của user, mới sửa nhất trước, tối đa
 * `limit`. `projectId` → thư mục dự án; `spaceId` → thư mục không gian + thư mục các dự án của nó;
 * không lọc → mọi thư mục của user. Chưa có thư mục nào trong phạm vi → `[]`, không gọi Google.
 */
export async function listFiles(
  userId: string,
  params: ListFilesParams,
  deps: ListFilesDeps = defaultDeps,
): Promise<ListFilesResult> {
  const plan = await planDriveQuery(userId, params);
  if (!plan) return { ok: false, reason: "not_found" };
  if (plan.queries.length === 0) return { ok: true, files: [] };

  const result = await deps.listDriveFiles(userId, plan.queries, plan.pageSize);
  if (result.status === "not_connected") return { ok: false, reason: "drive_not_connected" };
  if (result.status === "error") return { ok: false, reason: "drive_error" };

  const items = result.files
    .map((file) => toDriveFileItem(file, plan.index))
    .filter((item): item is DriveFileItem => item !== null);
  return { ok: true, files: mergeRecent([items], params.limit) };
}

export type CreateFileResult =
  | { ok: true; file: DriveFileItem }
  | { ok: false; reason: "not_found" | "drive_not_connected" | "drive_error" };

export interface CreateFileDeps {
  createDriveFile: typeof createDriveFile;
  /** User đã cấp scope `drive.file` chưa — chỉ hỏi khi phải tạo bù thư mục. */
  hasDriveScope(userId: string): Promise<boolean>;
  ensureSpaceFolderId: typeof ensureSpaceFolderId;
  ensureProjectFolderId: typeof ensureProjectFolderId;
  /** Giờ dự phòng khi Drive không trả `modifiedTime` (test ghi đè). */
  now?: () => Date;
}

const defaultCreateDeps: CreateFileDeps = {
  createDriveFile,
  hasDriveScope: (userId) => hasGoogleScope(userId, GOOGLE_SCOPES.drive),
  ensureSpaceFolderId,
  ensureProjectFolderId,
};

const FILES_LOG = { prefix: "[files]" } as const;

type FolderRow = { id: string; name: string; driveFolderId: string | null };

interface CreateTarget {
  space: FolderRow;
  project: FolderRow | null;
}

/** Không gian (và dự án, nếu có) thuộc user; dự án phải nằm trong đúng `spaceId`. `null` → not_found. */
async function loadCreateTarget(userId: string, input: CreateFileInput): Promise<CreateTarget | null> {
  const space = await prisma.space.findFirst({ where: { id: input.spaceId, userId }, select: projectSelect });
  if (!space) return null;
  if (!input.projectId) return { space, project: null };
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, userId, spaceId: space.id },
    select: projectSelect,
  });
  return project ? { space, project } : null;
}

type FolderOutcome = { ok: true; folderId: string } | { ok: false; reason: "drive_not_connected" | "drive_error" };

/**
 * Id thư mục đích (dự án nếu có, không gian nếu không). Chưa có → kiểm scope trước để phân biệt
 * 403 / 502 (provision im lặng khi thiếu scope), rồi tạo bù qua `ensure*`.
 */
async function resolveTargetFolder(userId: string, target: CreateTarget, deps: CreateFileDeps): Promise<FolderOutcome> {
  const existing = target.project ? target.project.driveFolderId : target.space.driveFolderId;
  if (existing) return { ok: true, folderId: existing };
  if (!(await deps.hasDriveScope(userId))) return { ok: false, reason: "drive_not_connected" };
  const folderId = target.project
    ? await deps.ensureProjectFolderId(userId, { space: target.space, project: target.project }, FILES_LOG)
    : await deps.ensureSpaceFolderId(userId, target.space, FILES_LOG);
  return folderId ? { ok: true, folderId } : { ok: false, reason: "drive_error" };
}

/** Index chỉ gồm thư mục đích, để file mới luôn ánh xạ về đúng không gian / dự án vừa chọn. */
function targetIndex(target: CreateTarget, folderId: string) {
  const { space, project } = target;
  if (!project) return buildFolderIndex([{ ...space, driveFolderId: folderId, projects: [] }]);
  return buildFolderIndex([{ ...space, driveFolderId: null, projects: [{ ...project, driveFolderId: folderId }] }]);
}

/**
 * Tạo một Google Doc / Sheet / Slide trống trong thư mục Drive của dự án (nếu có `projectId`) hoặc
 * không gian, trả `DriveFileItem` cùng hình dạng `GET /api/files`. Thư mục đích chưa có → tạo bù;
 * tạo bù không được → `drive_error`, không tạo file ra ngoài thư mục Taskeo. Không ghi Activity.
 *
 * Không có hạn tổng ở server: mỗi lệnh gọi Google ≤ 10 s, nên tổng tối đa ~30 s (tạo bù thư mục không
 * gian + dự án + tạo file). Client hết hạn trước khi bước cuối xong, hoặc file đã tạo nhưng không ánh xạ
 * được (`drive_error`), có thể để lại file mồ côi trên Drive; người dùng thử lại sẽ tạo bản trùng.
 */
export async function createFile(
  userId: string,
  input: CreateFileInput,
  deps: CreateFileDeps = defaultCreateDeps,
): Promise<CreateFileResult> {
  const target = await loadCreateTarget(userId, input);
  if (!target) return { ok: false, reason: "not_found" };

  const folder = await resolveTargetFolder(userId, target, deps);
  if (!folder.ok) return folder;

  const result = await deps.createDriveFile(userId, {
    name: toDriveFileName(input.name),
    kind: input.kind,
    parentId: folder.folderId,
  });
  if (result.status === "not_connected") return { ok: false, reason: "drive_not_connected" };
  if (result.status === "error") return { ok: false, reason: "drive_error" };

  const now = deps.now ?? (() => new Date());
  const raw = {
    ...result.file,
    modifiedTime: result.file.modifiedTime || now().toISOString(),
    parents: result.file.parents?.length ? result.file.parents : [folder.folderId],
  };
  const file = toDriveFileItem(raw, targetIndex(target, folder.folderId));
  if (file) return { ok: true, file };
  // File đã nằm trên Drive nhưng không trả được: chỉ log id nội bộ, không tên file / URL.
  console.error(`${FILES_LOG.prefix} File Drive vừa tạo không ánh xạ được`, {
    userId,
    spaceId: target.space.id,
    projectId: target.project?.id ?? null,
  });
  return { ok: false, reason: "drive_error" };
}
