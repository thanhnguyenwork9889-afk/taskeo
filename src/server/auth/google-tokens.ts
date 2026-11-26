import "server-only";
import type { Account } from "next-auth";
import type { AdapterAccount } from "next-auth/adapters";
import { encrypt, encryptOptional } from "@/server/crypto";
import type { GoogleScope } from "@/server/google/scopes";

/**
 * Tham số ủy quyền Google cho đăng nhập giai đoạn 1.
 * - scope: chỉ scope đăng nhập; Drive / Calendar xin thêm sau (incremental authorization),
 *   xem server/google/scopes.ts.
 * - access_type=offline: bắt buộc để Google trả refresh token.
 * - prompt=consent: Google chỉ trả refresh token khi người dùng thấy màn hình đồng ý;
 *   ép consent để lần đăng nhập lại cũng nhận refresh token mới (tránh token cũ / bị thu hồi).
 * - include_granted_scopes=true: giữ các scope đã cấp trước đó khi xin thêm.
 */
export const GOOGLE_AUTHORIZATION_PARAMS = {
  scope: "openid email profile",
  access_type: "offline",
  prompt: "consent",
  include_granted_scopes: "true",
} as const satisfies Record<string, string>;

export type GoogleAuthorizationParams = {
  readonly [K in keyof typeof GOOGLE_AUTHORIZATION_PARAMS]: string;
};

/**
 * Tham số ủy quyền khi xin thêm scope (incremental authorization), dùng làm tham số thứ ba
 * của `signIn("google", options, params)`.
 * Tham số thứ ba ghi đè `authorization.params` của provider theo từng key, nên `scope` truyền
 * vào THAY HẲN scope đăng nhập; vì vậy phải gộp lại "openid email profile" + scope cần thêm.
 * Bỏ scope trùng (giữ thứ tự), luôn trả object mới, không mutate GOOGLE_AUTHORIZATION_PARAMS.
 */
export function buildIncrementalAuthorizationParams(
  extra: readonly GoogleScope[],
): GoogleAuthorizationParams {
  const scopes = [...GOOGLE_AUTHORIZATION_PARAMS.scope.split(" "), ...extra];
  return {
    ...GOOGLE_AUTHORIZATION_PARAMS,
    scope: [...new Set(scopes)].join(" "),
  };
}

/** Trả bản sao account với access/refresh/id token đã mã hoá (không mutate input). */
export function encryptAdapterAccountTokens(account: AdapterAccount): AdapterAccount {
  return {
    ...account,
    access_token: encryptOptional(account.access_token) ?? undefined,
    refresh_token: encryptOptional(account.refresh_token) ?? undefined,
    id_token: encryptOptional(account.id_token) ?? undefined,
  };
}

export interface ReSignInTokenUpdate {
  access_token: string;
  refresh_token?: string | null;
  id_token?: string | null;
  expires_at?: number;
  scope?: string;
}

/**
 * Dữ liệu cập nhật bảng Account khi đăng nhập lại bằng Google. Trả null nếu không có gì để lưu.
 * Key vắng trong account thì không xuất hiện, để không ghi đè giá trị cũ trong DB.
 */
export function buildReSignInTokenUpdate(account: Account | null): ReSignInTokenUpdate | null {
  if (!account || account.provider !== "google" || !account.access_token) return null;
  return {
    access_token: encrypt(account.access_token),
    ...(account.refresh_token ? { refresh_token: encryptOptional(account.refresh_token) } : {}),
    ...(account.id_token ? { id_token: encryptOptional(account.id_token) } : {}),
    ...(account.expires_at ? { expires_at: account.expires_at } : {}),
    ...(account.scope ? { scope: account.scope } : {}),
  };
}
