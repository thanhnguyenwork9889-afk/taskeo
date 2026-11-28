import type { DocKind, DriveFileItem } from "@/domain/types";
import { toDriveFolderName } from "@/domain/drive-folder-name";
import { DRIVE_FILE_ID_PATTERN, isDriveUrl } from "@/domain/validation";

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

/** Tên file mặc định khi tên người dùng nhập rỗng sau chuẩn hoá. */
export const DEFAULT_DRIVE_FILE_NAME = "Tài liệu không tên";

/** mimeType lối tắt (shortcut) Google Drive. */
export const DRIVE_SHORTCUT_MIME = "application/vnd.google-apps.shortcut";

/** Khoá `appProperties` ghi loại tài liệu đích lên lối tắt (để chuỗi `q` lọc được theo loại). */
export const SHORTCUT_KIND_PROPERTY = "taskeoTargetKind";

/** `error.code` của API: file đích đã được gắn vào thư mục này. */
export const ALREADY_ATTACHED_CODE = "already_attached";

/** `error.code` của API: file đích không gắn được (không phải Docs / Sheets / Slides, đã xoá, không truy cập được). */
export const INVALID_TARGET_CODE = "invalid_target";

/** `error.code` của API: server thiếu cấu hình Google Picker. */
export const PICKER_NOT_CONFIGURED_CODE = "picker_not_configured";

/** Trường `files.create` cần trả để dựng `DriveFileItem` (khớp `RawDriveFile`). */
export const DRIVE_FILE_CREATE_FIELDS = "id,name,mimeType,modifiedTime,webViewLink,parents";

/** Như `DRIVE_FILE_CREATE_FIELDS`, thêm thông tin đích của lối tắt. */
export const DRIVE_SHORTCUT_CREATE_FIELDS = `${DRIVE_FILE_CREATE_FIELDS},shortcutDetails(targetId,targetMimeType)`;

/** Trường `files.get` khi đọc file đích trước khi tạo lối tắt. */
export const DRIVE_TARGET_FIELDS = "id,name,mimeType,trashed,parents";

const EDIT_URL_PATH: Record<DocKind, string> = { doc: "document", sheet: "spreadsheets", slide: "presentation" };

/** Liên kết sửa file Google theo loại; `id` không phải ID Drive hợp lệ → `null`. */
export function driveEditUrl(kind: DocKind, id: string): string | null {
  if (!DRIVE_FILE_ID_PATTERN.test(id)) return null;
  const url = `https://docs.google.com/${EDIT_URL_PATH[kind]}/d/${id}/edit`;
  return isDriveUrl(url) ? url : null;
}

/** Chuẩn hoá tên file Drive giống tên thư mục (`toDriveFolderName`); rỗng → `DEFAULT_DRIVE_FILE_NAME`. */
export function toDriveFileName(raw: string): string {
  return toDriveFolderName(raw, DEFAULT_DRIVE_FILE_NAME);
}

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

function mimeEquals(mime: string): string {
  return `mimeType='${escapeDriveQueryValue(mime)}'`;
}

/**
 * Loại tài liệu, kể cả lối tắt. `q` không lọc được theo `shortcutDetails.targetMimeType`, nên khi có
 * `kind` thì lọc lối tắt qua `appProperties` mà app ghi lúc tạo; nơi gọi vẫn lọc lại theo đích.
 */
function mimeClause(kind?: DocKind): string {
  if (kind) {
    const property = `key='${escapeDriveQueryValue(SHORTCUT_KIND_PROPERTY)}' and value='${escapeDriveQueryValue(kind)}'`;
    const tagged = `${mimeEquals(DRIVE_SHORTCUT_MIME)} and appProperties has { ${property} }`;
    return `(${mimeEquals(DOC_KIND_MIME[kind])} or (${tagged}))`;
  }
  const parts = [...DOC_KIND_ENTRIES.map(([, mime]) => mime), DRIVE_SHORTCUT_MIME].map(mimeEquals);
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

/**
 * Chuỗi `q` tìm lối tắt (chưa vào thùng rác) tới `targetId`, ở bất kỳ thư mục nào.
 *
 * Cố ý KHÔNG gộp `'<parentId>' in parents`: Drive API trả 400 `Invalid Value` (`reason: "invalid"`,
 * `location: "q"`) khi `shortcutDetails.targetId` đi cùng điều kiện `in parents`. Nơi gọi xin
 * `fields: "files(id,parents)"` rồi tự lọc theo thư mục cha trong code.
 */
export function buildShortcutLookupQuery(targetId: string): string {
  return [
    mimeEquals(DRIVE_SHORTCUT_MIME),
    `shortcutDetails.targetId='${escapeDriveQueryValue(targetId)}'`,
    "trashed=false",
  ].join(" and ");
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
  shortcutDetails?: { targetId?: string | null; targetMimeType?: string | null } | null;
}

/** Chỉ giữ các trường đã xin từ Drive (bỏ mọi trường thừa). Không sửa `file`. */
export function pickRawDriveFile(file: RawDriveFile): RawDriveFile {
  const picked: RawDriveFile = {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    modifiedTime: file.modifiedTime,
    webViewLink: file.webViewLink,
    parents: file.parents,
  };
  const details = file.shortcutDetails;
  if (!details) return picked;
  return { ...picked, shortcutDetails: { targetId: details.targetId, targetMimeType: details.targetMimeType } };
}

interface ResolvedTarget {
  kind: DocKind;
  url: string | null;
  shortcut: boolean;
}

/** Loại + URL mở file: lối tắt theo file đích (`null` nếu đích không phải 3 loại), file thường theo chính nó. */
function resolveTarget(raw: RawDriveFile): ResolvedTarget | null {
  if (raw.mimeType === DRIVE_SHORTCUT_MIME) {
    const kind = docKindFromMime(raw.shortcutDetails?.targetMimeType);
    if (!kind) return null;
    const targetId = raw.shortcutDetails?.targetId;
    return { kind, url: targetId ? driveEditUrl(kind, targetId) : null, shortcut: true };
  }
  const kind = docKindFromMime(raw.mimeType);
  if (!kind) return null;
  const url = raw.webViewLink && isDriveUrl(raw.webViewLink) ? raw.webViewLink : null;
  return { kind, url, shortcut: false };
}

/** Thư mục dự án thắng thư mục không gian; nếu không, lấy thư mục khớp đầu tiên theo thứ tự `parents`. */
function findOwner(parents: readonly string[], index: ReadonlyMap<string, FolderOwner>): FolderOwner | null {
  const owners = parents.map((id) => index.get(id)).filter((owner) => owner !== undefined);
  return owners.find((owner) => owner.projectId !== null) ?? owners[0] ?? null;
}

/**
 * File Drive → bản ghi phía client. `null` khi thiếu `id` / `modifiedTime` (không xếp được theo
 * thời gian), mimeType lạ (lối tắt: đích không phải 3 loại), hoặc không nằm trong thư mục nào của
 * user. URL không phải Drive → `null`. Lối tắt mở file đích (dựng từ `targetId`, không dùng `webViewLink`).
 */
export function toDriveFileItem(raw: RawDriveFile, index: ReadonlyMap<string, FolderOwner>): DriveFileItem | null {
  const target = resolveTarget(raw);
  if (!raw.id || !raw.modifiedTime || !target) return null;
  const owner = findOwner(raw.parents ?? [], index);
  if (!owner) return null;
  const name = raw.name?.trim() ? raw.name : DRIVE_FILE_UNNAMED;
  const { kind, url, shortcut } = target;
  return { id: raw.id, name, kind, url, modifiedAt: raw.modifiedTime, ...owner, shortcut };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}

/** Kiểm hình dạng `DriveFileItem` nhận từ API (client dùng chung). `url` phải null hoặc liên kết Drive HTTPS. */
export function isDriveFileItem(value: unknown): value is DriveFileItem {
  if (!isRecord(value)) return false;
  const { id, name, kind, url, modifiedAt, spaceId, projectId, spaceName, projectName, shortcut } = value;
  const strings = [id, name, modifiedAt, spaceId, spaceName].every((field) => typeof field === "string");
  const kindOk = typeof kind === "string" && Object.hasOwn(DOC_KIND_MIME, kind);
  const urlOk = url === null || (typeof url === "string" && isDriveUrl(url));
  const nullablesOk = [projectId, projectName].every(isNullableString);
  return strings && kindOk && urlOk && nullablesOk && typeof shortcut === "boolean";
}

/** Gộp nhiều danh sách: bỏ trùng `id`, xếp `modifiedAt` mới nhất trước, lấy tối đa `limit`. */
export function mergeRecent(lists: readonly (readonly DriveFileItem[])[], limit: number): DriveFileItem[] {
  const byId = new Map<string, DriveFileItem>();
  for (const file of lists.flat()) if (!byId.has(file.id)) byId.set(file.id, file);
  return [...byId.values()]
    .sort((a, b) => (a.modifiedAt < b.modifiedAt ? 1 : a.modifiedAt > b.modifiedAt ? -1 : 0))
    .slice(0, Math.max(0, limit));
}
