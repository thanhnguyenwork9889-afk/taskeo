import type { DriveStorage } from "@/domain/types";

// Gọi `GET /api/drive/storage` từ trình duyệt (T016). `components/layout/` không được import
// `features/` hay `server/`, nên đây là bản gọn theo khuôn `features/docs/drive-files-api.ts`.

export const DRIVE_STORAGE_PATH = "/api/drive/storage";
const FALLBACK_MESSAGE = "Không tải được dung lượng";
const MALFORMED_MESSAGE = "Phản hồi dung lượng Drive không hợp lệ";
const MAX_NETWORK_RETRIES = 1;

/** Lỗi khi API trả mã không OK hoặc phản hồi sai hình dạng. */
export class DriveStorageRequestError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "DriveStorageRequestError";
    this.status = status;
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isByteCount(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isLimit(value: unknown): boolean {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value > 0);
}

function isDriveStorage(value: unknown): value is DriveStorage {
  if (!isRecord(value)) return false;
  const { usage, usageInDrive, usageInDriveTrash, limit } = value;
  return [usage, usageInDrive, usageInDriveTrash].every(isByteCount) && isLimit(limit);
}

/** `{ data: { storage: DriveStorage } }` → storage; sai hình dạng → `null`. */
function storageFromBody(body: unknown): DriveStorage | null {
  if (!isRecord(body) || !isRecord(body.data)) return null;
  const { storage } = body.data;
  return isDriveStorage(storage) ? storage : null;
}

function errorFromBody(body: unknown, status: number): DriveStorageRequestError {
  const error = isRecord(body) && isRecord(body.error) ? body.error : {};
  const message = typeof error.message === "string" && error.message.trim() ? error.message : FALLBACK_MESSAGE;
  const code = typeof error.code === "string" ? error.code : undefined;
  return new DriveStorageRequestError(message, status, code);
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

/** Tải dung lượng Drive qua API. Mã không OK, JSON hỏng hoặc sai hình dạng → `DriveStorageRequestError`. */
export async function fetchDriveStorage(signal?: AbortSignal): Promise<DriveStorage> {
  const response = await fetch(DRIVE_STORAGE_PATH, { signal, headers: { Accept: "application/json" } });
  const body = await readBody(response, signal);
  if (!response.ok) throw errorFromBody(body.ok ? body.value : null, response.status);
  const storage = body.ok ? storageFromBody(body.value) : null;
  if (!storage) throw new DriveStorageRequestError(MALFORMED_MESSAGE, response.status);
  return storage;
}

/**
 * Predicate `retry` của TanStack Query: server đã trả lời (`DriveStorageRequestError`, mọi mã) → không thử lại,
 * vì server đã có hạn chờ Drive riêng; chỉ lỗi mạng mới thử lại, tối đa 1 lần.
 */
export function shouldRetryDriveStorage(failureCount: number, error: unknown): boolean {
  if (error instanceof DriveStorageRequestError) return false;
  return failureCount < MAX_NETWORK_RETRIES;
}
