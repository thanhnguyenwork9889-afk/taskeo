import type { DocKind, DriveFileItem } from "@/domain/types";
import { isDriveUrl } from "@/domain/validation";

// Hàm thuần cho việc liệt kê file Google Drive (T015): dựng chuỗi `q`, ánh xạ file Drive
// về không gian / dự án theo thư mục cha. Dùng chung cho server và client.

/** mimeType Google Drive của từng loại tài liệu. */
export const DOC_KIND_MIME: Record<DocKind, string> = {
  doc: "application/vnd.google-apps.document",
  sheet: "application/vnd.google-apps.spreadsheet",
  slide: "application/vnd.google-apps.presentation",
};

/** Số thư mục cha tối đa trong một chuỗi `q` (giữ `q` ngắn khi lọc theo không gian nhiều dự án). */
export const DRIVE_PARENTS_PER_QUERY = 40;

/** `error.code` của API khi user chưa kết nối Drive / thiếu scope. */
export const DRIVE_NOT_CONNECTED_CODE = "drive_not_connected";

/** Tên hiển thị khi Drive không trả tên file. */
export const DRIVE_FILE_UNNAMED = "Không có tên";

const DOC_KIND_ENTRIES = Object.entries(DOC_KIND_MIME) as [DocKind, string][];

/** mimeType → loại tài liệu; mimeType khác 3 loại Google (kể cả thiếu) → `null`. */
export function docKindFromMime(mime?: string | null): DocKind | null {
  if (!mime) return null;
  return DOC_KIND_ENTRIES.find(([, value]) => value === mime)?.[0] ?? null;
}

/**
 * Thoát giá trị đặt trong dấu nháy đơn của chuỗi `q` (Drive API v3).
 * Thoát `\` trước rồi mới tới `'`, để `\` vừa thêm cho `'` không bị nhân đôi.
 */
export function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function mimeClause(kind?: DocKind): string {
  if (kind) return `mimeType='${escapeDriveQueryValue(DOC_KIND_MIME[kind])}'`;
  const parts = DOC_KIND_ENTRIES.map(([, mime]) => `mimeType='${escapeDriveQueryValue(mime)}'`);
  return `(${parts.join(" or ")})`;
}

/** Chuỗi `q` cho `files.list`: loại tài liệu + chưa vào thùng rác (+ thuộc một trong các thư mục cha). */
export function buildDriveFilesQuery({ kind, parentIds = [] }: { kind?: DocKind; parentIds?: readonly string[] }): string {
  const clauses = [mimeClause(kind), "trashed=false"];
  if (parentIds.length > 0) {
    const parents = parentIds.map((id) => `'${escapeDriveQueryValue(id)}' in parents`);
    clauses.push(`(${parents.join(" or ")})`);
  }
  return clauses.join(" and ");
}

/** Chia `items` thành các khối tối đa `size` phần tử. `size` phải là số nguyên dương. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new RangeError("size phải là số nguyên dương");
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += size) groups.push(items.slice(i, i + size));
  return groups;
}

/** Không gian / dự án sở hữu một thư mục Drive. */
export interface FolderOwner {
  spaceId: string;
  spaceName: string;
  projectId: string | null;
  projectName: string | null;
}

export interface FolderProject {
  id: string;
  name: string;
  driveFolderId: string | null;
}

export interface FolderSpace extends FolderProject {
  projects: FolderProject[];
}

function hasFolder(folderId: string | null): folderId is string {
  return folderId !== null && folderId.trim() !== "";
}

/** Bảng `driveFolderId` → chủ sở hữu (không gian hoặc dự án). Bỏ qua thư mục chưa có. */
export function buildFolderIndex(spaces: readonly FolderSpace[]): Map<string, FolderOwner> {
  const index = new Map<string, FolderOwner>();
  for (const space of spaces) {
    const base = { spaceId: space.id, spaceName: space.name };
    if (hasFolder(space.driveFolderId)) index.set(space.driveFolderId, { ...base, projectId: null, projectName: null });
    for (const project of space.projects) {
      if (!hasFolder(project.driveFolderId)) continue;
      index.set(project.driveFolderId, { ...base, projectId: project.id, projectName: project.name });
    }
  }
  return index;
}

/** File như `files.list` trả (các trường đều có thể thiếu). */
export interface RawDriveFile {
  id?: string | null;
  name?: string | null;
  mimeType?: string | null;
  modifiedTime?: string | null;
  webViewLink?: string | null;
  parents?: string[] | null;
}

/** Thư mục dự án thắng thư mục không gian; nếu không, lấy thư mục khớp đầu tiên theo thứ tự `parents`. */
function findOwner(parents: readonly string[], index: ReadonlyMap<string, FolderOwner>): FolderOwner | null {
  const owners = parents.map((id) => index.get(id)).filter((owner) => owner !== undefined);
  return owners.find((owner) => owner.projectId !== null) ?? owners[0] ?? null;
}

/**
 * File Drive → bản ghi phía client. `null` khi thiếu `id` / `modifiedTime` (không xếp được theo
 * thời gian), mimeType lạ, hoặc không nằm trong thư mục nào của user. URL không phải Drive → `null`.
 */
export function toDriveFileItem(raw: RawDriveFile, index: ReadonlyMap<string, FolderOwner>): DriveFileItem | null {
  const kind = docKindFromMime(raw.mimeType);
  if (!raw.id || !raw.modifiedTime || !kind) return null;
  const owner = findOwner(raw.parents ?? [], index);
  if (!owner) return null;
  const name = raw.name?.trim() ? raw.name : DRIVE_FILE_UNNAMED;
  const url = raw.webViewLink && isDriveUrl(raw.webViewLink) ? raw.webViewLink : null;
  return { id: raw.id, name, kind, url, modifiedAt: raw.modifiedTime, ...owner };
}

/** Gộp nhiều danh sách: bỏ trùng `id`, xếp `modifiedAt` mới nhất trước, lấy tối đa `limit`. */
export function mergeRecent(lists: readonly (readonly DriveFileItem[])[], limit: number): DriveFileItem[] {
  const byId = new Map<string, DriveFileItem>();
  for (const file of lists.flat()) if (!byId.has(file.id)) byId.set(file.id, file);
  return [...byId.values()]
    .sort((a, b) => (a.modifiedAt < b.modifiedAt ? 1 : a.modifiedAt > b.modifiedAt ? -1 : 0))
    .slice(0, Math.max(0, limit));
}
