import { DOC_KIND_MIME } from "@/domain/drive-files";
import type { DocKind, DriveFileItem } from "@/domain/types";
import { isDriveUrl } from "@/domain/validation";

// Gọi API cho hộp thoại tạo tài liệu ở chế độ configured (T017): `GET /api/spaces`,
// `GET /api/spaces/[id]/projects`, `POST /api/files`. `components/layout/` không được import
// `features/` hay `server/`, nên đây là bản gọn theo khuôn `drive-storage-api.ts`.

const SPACES_PATH = "/api/spaces";
const FILES_PATH = "/api/files";
const FALLBACK_MESSAGE = "Không gọi được máy chủ";
const MALFORMED_MESSAGE = "Phản hồi từ máy chủ không hợp lệ";
const MAX_NETWORK_RETRIES = 1;

/** Lỗi khi API trả mã không OK hoặc phản hồi sai hình dạng. */
export class CreateDocRequestError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "CreateDocRequestError";
    this.status = status;
    this.code = code;
  }
}

/** Một lựa chọn trong ô không gian / dự án. */
export interface NamedOption {
  id: string;
  name: string;
}

export interface CreateFileFormValues {
  name: string;
  kind: DocKind;
  spaceId: string;
  /** `""` = không gắn dự án. */
  projectId: string;
}

/** Body `POST /api/files` (cùng hình dạng `CreateFileInput`). */
export interface CreateFileBody {
  name: string;
  kind: DocKind;
  spaceId: string;
  projectId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}

function isDriveFileItem(value: unknown): value is DriveFileItem {
  if (!isRecord(value)) return false;
  const { id, name, kind, url, modifiedAt, spaceId, projectId, spaceName, projectName } = value;
  const strings = [id, name, modifiedAt, spaceId, spaceName].every((field) => typeof field === "string");
  const kindOk = typeof kind === "string" && Object.hasOwn(DOC_KIND_MIME, kind);
  return strings && kindOk && [url, projectId, projectName].every(isNullableString);
}

/** `{ data: [{ id, name, ... }] }` → `{ id, name }[]`; sai hình dạng → `null`. */
function optionsFromBody(body: unknown): NamedOption[] | null {
  if (!isRecord(body) || !Array.isArray(body.data)) return null;
  const items: unknown[] = body.data;
  const valid = items.every((item) => isRecord(item) && typeof item.id === "string" && typeof item.name === "string");
  if (!valid) return null;
  return (items as NamedOption[]).map(({ id, name }) => ({ id, name }));
}

/** `{ data: { file } }` → file (url không phải Drive → `null`); sai hình dạng → `null`. */
function fileFromBody(body: unknown): DriveFileItem | null {
  if (!isRecord(body) || !isRecord(body.data)) return null;
  const { file } = body.data;
  if (!isDriveFileItem(file)) return null;
  return { ...file, url: file.url && isDriveUrl(file.url) ? file.url : null };
}

function errorFromBody(body: unknown, status: number): CreateDocRequestError {
  const error = isRecord(body) && isRecord(body.error) ? body.error : {};
  const message = typeof error.message === "string" && error.message.trim() ? error.message : FALLBACK_MESSAGE;
  const code = typeof error.code === "string" ? error.code : undefined;
  return new CreateDocRequestError(message, status, code);
}

/** Đọc JSON; JSON hỏng → `{ ok: false }`. Bị huỷ giữa chừng → ném lại lý do huỷ để TanStack nhận ra. */
async function readBody(response: Response, signal?: AbortSignal): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    return { ok: true, value: await response.json() };
  } catch (error) {
    if (signal?.aborted) throw signal.reason ?? error;
    return { ok: false };
  }
}

/** Gửi request, đọc envelope; mã không OK / JSON hỏng / `parse` trả `null` → `CreateDocRequestError`. */
async function request<T>(url: string, init: RequestInit, parse: (body: unknown) => T | null): Promise<T> {
  const response = await fetch(url, { ...init, headers: { Accept: "application/json", ...init.headers } });
  const body = await readBody(response, init.signal ?? undefined);
  if (!response.ok) throw errorFromBody(body.ok ? body.value : null, response.status);
  const value = body.ok ? parse(body.value) : null;
  if (value === null) throw new CreateDocRequestError(MALFORMED_MESSAGE, response.status);
  return value;
}

/** Không gian của người dùng từ DB (`GET /api/spaces`). */
export function fetchApiSpaces(signal?: AbortSignal): Promise<NamedOption[]> {
  return request(SPACES_PATH, { signal }, optionsFromBody);
}

/** Dự án của một không gian (`GET /api/spaces/[id]/projects`). */
export function fetchApiProjects(spaceId: string, signal?: AbortSignal): Promise<NamedOption[]> {
  return request(`${SPACES_PATH}/${encodeURIComponent(spaceId)}/projects`, { signal }, optionsFromBody);
}

/** Tạo file Google trống trong thư mục Drive (`POST /api/files`, 201 `{ data: { file } }`). */
export function postDriveFile(body: CreateFileBody): Promise<DriveFileItem> {
  const init: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
  return request(FILES_PATH, init, fileFromBody);
}

/** Giá trị form → body API: trim tên, bỏ `projectId` rỗng. Không sửa `values`. */
export function buildCreateFileBody(values: CreateFileFormValues): CreateFileBody {
  const base = { name: values.name.trim(), kind: values.kind, spaceId: values.spaceId };
  const projectId = values.projectId.trim();
  return projectId ? { ...base, projectId } : base;
}

/** Predicate `retry` của TanStack Query: 4xx không thử lại; 5xx / lỗi mạng thử lại tối đa 1 lần. */
export function shouldRetryCreateDocQuery(failureCount: number, error: unknown): boolean {
  if (error instanceof CreateDocRequestError && error.status >= 400 && error.status < 500) return false;
  return failureCount < MAX_NETWORK_RETRIES;
}
