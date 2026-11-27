import "server-only";

// Phạm vi nạp như `drive-storage.ts`: `./client` (và `googleapis`) chỉ được import động trong
// `defaultDeps.getAccessToken`, sau khi đã thấy scope `drive.file`. Không thêm scope mới.
//
// Đây là ngoại lệ duy nhất cho phép access token rời server (docs/02-google-cloud.md): route
// `GET /api/drive/picker-token` trả nó cho Google Picker. Token mang mọi scope đã cấp, nên:
// chỉ lấy khi user bấm, `Cache-Control: no-store`, không bao giờ log.
import { runWithDeadline } from "./deadline";
import { classifyDriveError, driveErrorLogFields, isSilentDriveError } from "./drive-errors";
import { hasGoogleScope } from "./granted-scopes";
import { GOOGLE_SCOPES } from "./scopes";

/** Hạn tổng cho kiểm tra scope → lấy client → (refresh) access token. */
export const PICKER_TOKEN_TIMEOUT_MS = 10_000;

const LOG_MESSAGE = "[google/picker] Không lấy được access token cho Picker";

export interface PickerAccessToken {
  token: string | null | undefined;
  /** `credentials.expiry_date` (ms epoch) nếu có. */
  expiryDate: number | null | undefined;
}

export interface PickerTokenDeps {
  /** User đã cấp scope `drive.file` chưa. */
  hasDriveScope(userId: string): Promise<boolean>;
  /** Access token còn hạn (thư viện tự refresh). Có thể ném `GoogleNotConnectedError`. */
  getAccessToken(userId: string): Promise<PickerAccessToken>;
  /** Ghi đè `PICKER_TOKEN_TIMEOUT_MS` (dùng cho test). */
  totalTimeoutMs?: number;
}

export const defaultDeps: PickerTokenDeps = {
  hasDriveScope: (userId) => hasGoogleScope(userId, GOOGLE_SCOPES.drive),
  async getAccessToken(userId) {
    const { getGoogleAuth } = await import("./client");
    const auth = await getGoogleAuth(userId);
    // Hết hạn thì thư viện refresh; listener "tokens" trong `getGoogleAuth` lưu token mới vào DB.
    const { token } = await auth.getAccessToken();
    return { token, expiryDate: auth.credentials.expiry_date };
  },
};

export type PickerTokenResult =
  | { status: "ok"; accessToken: string; expiresAt: string | null }
  | { status: "not_connected" }
  | { status: "error" };

/** Thư viện trả token rỗng. Chỉ `name` được log. */
class EmptyAccessTokenError extends Error {
  constructor() {
    super("Google trả access token rỗng");
    this.name = "EmptyAccessTokenError";
  }
}

function toIsoOrNull(expiryDate: number | null | undefined): string | null {
  if (typeof expiryDate !== "number" || !Number.isFinite(expiryDate)) return null;
  return new Date(expiryDate).toISOString();
}

/**
 * Access token ngắn hạn cho Google Picker.
 *
 * - Chưa có scope `drive.file` → `not_connected`, không gọi `getAccessToken` (không nạp `./client`).
 * - `GoogleNotConnectedError` / `GoogleScopeMissingError` → `not_connected`, không log.
 * - Token rỗng → `error`, log `EmptyAccessTokenError`.
 * - Lỗi khác hoặc quá hạn 10 s → `error`, log đúng một dòng gồm `userId`, tên lỗi đã phân loại
 *   và mã HTTP (không bao giờ `message` / `config` / `response` / token).
 *
 * Không bao giờ ném.
 */
export async function getPickerAccessToken(
  userId: string,
  deps: PickerTokenDeps = defaultDeps,
): Promise<PickerTokenResult> {
  const outcome = await runWithDeadline(
    async (signal): Promise<{ accessToken: string; expiresAt: string | null } | null> => {
      if (!(await deps.hasDriveScope(userId))) return null;
      signal.throwIfAborted();
      const { token, expiryDate } = await deps.getAccessToken(userId);
      if (typeof token !== "string" || token === "") throw new EmptyAccessTokenError();
      return { accessToken: token, expiresAt: toIsoOrNull(expiryDate) };
    },
    deps.totalTimeoutMs ?? PICKER_TOKEN_TIMEOUT_MS,
    "Quá hạn lấy access token cho Picker",
  );

  if (outcome.ok) {
    return outcome.value === null ? { status: "not_connected" } : { status: "ok", ...outcome.value };
  }
  if (isSilentDriveError(classifyDriveError(outcome.error).kind)) return { status: "not_connected" };
  console.error(LOG_MESSAGE, { userId, ...driveErrorLogFields(outcome.error) });
  return { status: "error" };
}
