/**
 * Tên cookie phiên (database session) của Auth.js, thứ tự = ưu tiên: `__Secure-` (https) trước,
 * không tiền tố (http) sau.
 * Phải khớp mặc định Auth.js (`defaultCookies` trong @auth/core, khoá bằng auth-cookies.test.ts).
 * Nếu cấu hình `cookies` hoặc `useSecureCookies` trong src/server/auth/auth.ts thì sửa ở đây.
 * Dùng chung cho src/proxy.ts và src/server/auth/account-link-data.ts.
 */
export const AUTH_SESSION_COOKIE_NAMES = ["__Secure-authjs.session-token", "authjs.session-token"] as const;
