import type { DriveFileItem, PickerTokenResponse } from "@/domain/types";
import { CREATE_DOC_TIMEOUT_CODE, CreateDocRequestError, fileFromBody, requestJson } from "./create-doc-api";

// Gọi API cho hộp thoại "Gắn file từ Drive" ở chế độ configured (T018): `GET /api/drive/picker-token`,
// `POST /api/files/attach`. Dùng lại `requestJson` / `fileFromBody` của hộp thoại tạo tài liệu.

export const PICKER_TOKEN_PATH = "/api/drive/picker-token";
export const ATTACH_FILE_PATH = "/api/files/attach";
/** Hạn chờ `POST /api/files/attach` ở client; lớn hơn tổng hạn phía server (~30 s). */
export const ATTACH_FILE_CLIENT_TIMEOUT_MS = 45_000;
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

/** Access token ngắn hạn + cấu hình Picker. Chỉ gọi khi người dùng bấm chọn file; không cache. */
export function fetchPickerToken(signal?: AbortSignal): Promise<PickerTokenResponse> {
  return requestJson(PICKER_TOKEN_PATH, { signal, cache: "no-store" }, pickerTokenFromBody);
}

function isTimeout(signal: AbortSignal): boolean {
  return signal.aborted && signal.reason instanceof DOMException && signal.reason.name === "TimeoutError";
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
