import "server-only";
import { GOOGLE_SIGN_IN_GRANTED_SCOPE } from "./scopes";

/**
 * Thu hồi quyền Google bằng `fetch` trực tiếp, không dùng `OAuth2Client.revokeToken` của thư viện:
 * thư viện gắn token vào query string và lỗi gaxios mang `config.url`, nên token dễ lọt vào log.
 * Lưu ý: Google không thu hồi riêng một scope; thu hồi một token sẽ huỷ mọi quyền của app trên
 * tài khoản Google đó (kể cả refresh token).
 */
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";

/** Thời gian chờ tối đa cho một lần gọi revoke. */
export const REVOKE_TIMEOUT_MS = 10_000;

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;

export type RevokeResult = "revoked" | "already-invalid" | "failed";

export interface StoredGoogleTokens {
  refresh_token: string | null;
  access_token: string | null;
}

export interface DisconnectedAccountUpdate {
  access_token: null;
  refresh_token: null;
  expires_at: null;
  scope: string;
}

/**
 * Chọn token để thu hồi: refresh token trước (thu hồi nó huỷ cả access token), không có thì
 * access token, không có gì thì null (không cần gọi Google).
 *
 * Nhận và trả giá trị **đã mã hoá** đúng như cột trong DB; người gọi tự `decrypt()` token được
 * chọn ngay trước khi gửi, để bản rõ chỉ tồn tại trong phạm vi hẹp nhất. Chuỗi rỗng coi như không có.
 */
export function selectRevokeToken(account: StoredGoogleTokens): string | null {
  if (account.refresh_token) return account.refresh_token;
  if (account.access_token) return account.access_token;
  return null;
}

function isInvalidTokenBody(body: unknown): boolean {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return false;
  return (body as { error?: unknown }).error === "invalid_token";
}

/**
 * Phân loại phản hồi của endpoint revoke:
 * 200 → `revoked`; 400 kèm `error: "invalid_token"` (token đã hết hạn / đã bị thu hồi) →
 * `already-invalid`; mọi trường hợp khác → `failed`.
 */
export function classifyRevokeResponse(status: number, body: unknown): RevokeResult {
  if (status === HTTP_OK) return "revoked";
  if (status === HTTP_BAD_REQUEST && isInvalidTokenBody(body)) return "already-invalid";
  return "failed";
}

/** Đọc body JSON; lỗi đọc hoặc parse trả `undefined` (sẽ được phân loại `failed`). */
async function readJsonBody(response: Response): Promise<unknown> {
  try {
    return JSON.parse(await response.text()) as unknown;
  } catch {
    return undefined;
  }
}

/** Huỷ body không cần đọc để giải phóng kết nối; lỗi khi huỷ bỏ qua (không ảnh hưởng kết quả). */
async function discardBody(response: Response): Promise<null> {
  try {
    await response.body?.cancel();
  } catch {
    // Bỏ qua: body đã đóng hoặc không huỷ được.
  }
  return null;
}

/** Chỉ lấy tên lỗi (TypeError, TimeoutError, AbortError…), không bao giờ lấy message. */
function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

/**
 * Gọi Google để thu hồi `token` (bản rõ). Token chỉ nằm trong body form, không ở URL.
 * Không bao giờ ném: lỗi mạng, timeout, phản hồi lạ đều trả `failed`.
 * Log chỉ ghi status HTTP hoặc tên lỗi, không ghi token, body hay message của lỗi fetch.
 */
export async function revokeGoogleToken(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RevokeResult> {
  try {
    const response = await fetchImpl(GOOGLE_REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
      signal: AbortSignal.timeout(REVOKE_TIMEOUT_MS),
    });
    // 200 là đủ để kết luận; body thành công không mang thông tin cần thiết nên huỷ luôn.
    const body = response.status === HTTP_OK ? await discardBody(response) : await readJsonBody(response);
    const result = classifyRevokeResponse(response.status, body);
    if (result === "failed") {
      console.error("[google/revoke] Thu hồi token thất bại", { status: response.status });
    }
    return result;
  } catch (error: unknown) {
    console.error("[google/revoke] Không gọi được Google để thu hồi token", {
      error: errorName(error),
    });
    return "failed";
  }
}

/**
 * Dữ liệu cập nhật Account sau khi ngắt kết nối: xoá token, `scope` chỉ còn scope đăng nhập.
 * Giữ nguyên `id_token` và các trường khác. Trả object mới mỗi lần gọi.
 */
export function buildDisconnectedAccountUpdate(): DisconnectedAccountUpdate {
  return {
    access_token: null,
    refresh_token: null,
    expires_at: null,
    scope: GOOGLE_SIGN_IN_GRANTED_SCOPE,
  };
}
