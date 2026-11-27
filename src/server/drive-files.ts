import "server-only";
import {
  buildDriveFilesQuery,
  buildFolderIndex,
  chunk,
  DRIVE_PARENTS_PER_QUERY,
  type FolderSpace,
  mergeRecent,
  toDriveFileItem,
} from "@/domain/drive-files";
import type { DocKind, DriveFileItem } from "@/domain/types";
import { FILE_LIST_MAX } from "@/domain/validation";
import { prisma } from "@/server/db";
import { listDriveFiles } from "@/server/google/drive-files";
import { MAX_PROJECTS_PER_SPACE } from "@/server/projects";
import { MAX_SPACES } from "@/server/spaces";

// Phạm vi nạp: module này chỉ được `GET /api/files` import động sau khi đã có phiên (chế độ
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

/**
 * Chọn phạm vi thư mục theo bộ lọc; `null` khi `spaceId` / `projectId` không thuộc user.
 * Index chỉ gồm thư mục trong phạm vi lọc, nên file có nhiều cha vẫn không lọt ra ngoài phạm vi.
 */
function planDriveQuery(spaces: readonly FolderSpace[], params: ListFilesParams): DrivePlan | null {
  const { spaceId, projectId, kind, limit } = params;

  if (projectId) {
    for (const space of spaces) {
      const project = space.projects.find((item) => item.id === projectId);
      if (!project) continue;
      const index = buildFolderIndex([{ ...space, driveFolderId: null, projects: [project] }]);
      return { index, queries: parentQueries(index, kind), pageSize: limit };
    }
    return null;
  }

  if (spaceId) {
    const space = spaces.find((item) => item.id === spaceId);
    if (!space) return null;
    const index = buildFolderIndex([space]);
    return { index, queries: parentQueries(index, kind), pageSize: limit };
  }

  // Không lọc: `q` không kèm parents (hàng trăm thư mục không vừa một `q`); lấy FILE_LIST_MAX file
  // mới nhất rồi giữ file nằm trong thư mục của user qua index.
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
  const spaces = await prisma.space.findMany({
    where: { userId },
    take: MAX_SPACES,
    select: {
      id: true,
      name: true,
      driveFolderId: true,
      // Lọc thêm userId: dự án luôn thuộc không gian của chính user, nhưng không dựa vào điều đó.
      projects: { where: { userId }, take: MAX_PROJECTS_PER_SPACE, select: { id: true, name: true, driveFolderId: true } },
    },
  });

  const plan = planDriveQuery(spaces, params);
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
