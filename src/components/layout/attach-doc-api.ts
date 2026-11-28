import type { DriveFileItem, PickerTokenResponse } from "@/domain/types";
import { CREATE_DOC_TIMEOUT_CODE, CreateDocRequestError, fileFromBody, requestJson } from "./create-doc-api";

// Gọi API cho hộp thoại "Gắn file từ Drive" ở chế độ configured (T018): `GET /api/drive/picker-token`,
// `POST /api/files/attach`. Dùng lại `requestJson` / `fileFromBody` của hộp thoại tạo tài liệu.

export const PICKER_TOKEN_PATH = "/api/drive/picker-token";
export const ATTACH_FILE_PATH = "/api/files/attach";
/** Hạn chờ `POST /api/files/attach` ở client; lớn hơn tổng hạn phía server (~30 s). */
export const ATTACH_FILE_CLIENT_TIMEOUT_MS = 45_000;
/** Hạn chờ `GET /api/drive/picker-token` ở client: quá hạn thì hộp thoại không kẹt ở "Đang mở Google Drive…". */
export const PICKER_TOKEN_CLIENT_TIMEOUT_MS = 15_000;
const TIMEOUT_MESSAGE = "Máy chủ phản hồi quá lâu";

/** Body `POST /api/files/attach`. */
export interface AttachFileBody {
  driveFileId: string;
  spaceId: string;
  projectId?: string;
}

export interface AttachFileBodyInput {
  driveFileId: string;
  spaceId: string;
  /** `""` / thiếu = không gắn dự án. */
  projectId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFilled(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/** `{ data: { accessToken, expiresAt, developerKey, appId } }` → token (bỏ trường thừa); sai hình dạng → `null`. */
function pickerTokenFromBody(body: unknown): PickerTokenResponse | null {
  if (!isRecord(body) || !isRecord(body.data)) return null;
  const { accessToken, expiresAt, developerKey, appId } = body.data;
  if (!isFilled(accessToken) || !isFilled(developerKey) || !isFilled(appId)) return null;
  if (expiresAt !== null && typeof expiresAt !== "string") return null;
  return { accessToken, expiresAt, developerKey, appId };
}

function isTimeout(signal: AbortSignal): boolean {
  return signal.aborted && signal.reason instanceof DOMException && signal.reason.name === "TimeoutError";
}

/** Signal abort khi một trong hai abort (lý do của signal abort trước). Dùng `AbortSignal.any` nếu có. */
function eitherSignal(a: AbortSignal, b: AbortSignal): AbortSignal {
  if (typeof AbortSignal.any === "function") return AbortSignal.any([a, b]);
  const controller = new AbortController();
  const source = [a, b].find((signal) => signal.aborted);
  if (source) {
    controller.abort(source.reason);
    return controller.signal;
  }
  for (const signal of [a, b]) {
    signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true, signal: controller.signal });
  }
  return controller.signal;
}

/**
 * Access token ngắn hạn + cấu hình Picker. Chỉ gọi khi người dùng bấm chọn file; không cache. Quá `timeoutMs`
 * → `CreateDocRequestError` status 0, code `timeout`; `signal` ngoài abort → ném lại lỗi abort.
 */
export async function fetchPickerToken(
  signal?: AbortSignal,
  { timeoutMs = PICKER_TOKEN_CLIENT_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<PickerTokenResponse> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? eitherSignal(signal, timeout) : timeout;
  try {
    return await requestJson(PICKER_TOKEN_PATH, { signal: combined, cache: "no-store" }, pickerTokenFromBody);
  } catch (error) {
    if (!signal?.aborted && isTimeout(timeout)) throw new CreateDocRequestError(TIMEOUT_MESSAGE, 0, CREATE_DOC_TIMEOUT_CODE);
    throw error;
  }
}

/**
 * Tạo lối tắt Drive tới file đã chọn (201 `{ data: { file } }`). Quá `timeoutMs` → `CreateDocRequestError`
 * status 0, code `timeout` (lối tắt có thể đã được tạo).
 */
export async function postAttachFile(
  body: AttachFileBody,
  { timeoutMs = ATTACH_FILE_CLIENT_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<DriveFileItem> {
  const signal = AbortSignal.timeout(timeoutMs);
  const init: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  };
  try {
    return await requestJson(ATTACH_FILE_PATH, init, fileFromBody);
  } catch (error) {
    if (isTimeout(signal)) throw new CreateDocRequestError(TIMEOUT_MESSAGE, 0, CREATE_DOC_TIMEOUT_CODE);
    throw error;
  }
}

/** Lựa chọn trong hộp thoại → body API: bỏ `projectId` rỗng. Không sửa `input`. */
export function buildAttachFileBody({ driveFileId, spaceId, projectId }: AttachFileBodyInput): AttachFileBody {
  const project = projectId?.trim() ?? "";
  return project ? { driveFileId, spaceId, projectId: project } : { driveFileId, spaceId };
}
