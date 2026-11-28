import { isDriveFileItem } from "@/domain/drive-files";
import type { DocKind, DriveFileItem } from "@/domain/types";
import { isDriveUrl } from "@/domain/validation";

// Gọi `GET /api/files` từ trình duyệt (T015). Không import server/: dạng phản hồi
// `{ data, error }` được kiểm lại ở đây.

const FILES_PATH = "/api/files";
const FALLBACK_MESSAGE = "Không tải được danh sách tài liệu";
const MALFORMED_MESSAGE = "Phản hồi danh sách tài liệu không hợp lệ";
const MAX_NETWORK_RETRIES = 1;

/** Lỗi khi API trả mã không OK hoặc phản hồi sai hình dạng. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
  }
}

export interface DriveFilesParams {
  spaceId?: string;
  projectId?: string;
  kind?: DocKind;
  limit?: number;
}

/** URL `GET /api/files`: bỏ tham số rỗng, thứ tự cố định spaceId → projectId → kind → limit. */
export function driveFilesUrl({ spaceId, projectId, kind, limit }: DriveFilesParams): string {
  const entries: [string, string | undefined][] = [
    ["spaceId", spaceId?.trim()],
    ["projectId", projectId?.trim()],
    ["kind", kind],
    ["limit", limit === undefined ? undefined : String(limit)],
  ];
  const search = new URLSearchParams(entries.filter((entry): entry is [string, string] => Boolean(entry[1])));
  const query = search.toString();
  return query ? `${FILES_PATH}?${query}` : FILES_PATH;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `url` là chuỗi nhưng không phải Drive → `null` (bản sao); giá trị khác giữ nguyên để `isDriveFileItem` kiểm. */
function withSafeUrl(file: unknown): unknown {
  if (!isRecord(file) || typeof file.url !== "string" || isDriveUrl(file.url)) return file;
  return { ...file, url: null };
}

/** `{ data: { files: DriveFileItem[] } }` → danh sách file; sai hình dạng → `null`. */
function filesFromBody(body: unknown): DriveFileItem[] | null {
  if (!isRecord(body) || !isRecord(body.data)) return null;
  const { files } = body.data;
  if (!Array.isArray(files)) return null;
  const safe: unknown[] = files.map(withSafeUrl);
  return safe.every(isDriveFileItem) ? safe : null;
}

function errorFromBody(body: unknown, status: number): ApiRequestError {
  const error = isRecord(body) && isRecord(body.error) ? body.error : {};
  const message = typeof error.message === "string" && error.message.trim() ? error.message : FALLBACK_MESSAGE;
  const code = typeof error.code === "string" ? error.code : undefined;
  return new ApiRequestError(message, status, code);
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

/** Tải file Drive qua API. Mã không OK, JSON hỏng hoặc sai hình dạng → `ApiRequestError`. */
export async function fetchDriveFiles(params: DriveFilesParams, signal?: AbortSignal): Promise<DriveFileItem[]> {
  const response = await fetch(driveFilesUrl(params), { signal, headers: { Accept: "application/json" } });
  const body = await readBody(response, signal);
  if (!response.ok) throw errorFromBody(body.ok ? body.value : null, response.status);
  const files = body.ok ? filesFromBody(body.value) : null;
  if (!files) throw new ApiRequestError(MALFORMED_MESSAGE, response.status);
  return files;
}

/**
 * Predicate `retry` của TanStack Query: server đã trả lời (`ApiRequestError`, mọi mã) → không thử lại,
 * vì server đã có hạn chờ Drive riêng; chỉ lỗi mạng mới thử lại, tối đa 1 lần.
 */
export function shouldRetryDriveFiles(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiRequestError) return false;
  return failureCount < MAX_NETWORK_RETRIES;
}
