// Không import "server-only" để proxy.ts dùng chung được. Chỉ đọc tên biến, không đọc giá trị ra ngoài.

export const AUTH_ENV_VARS = ["AUTH_SECRET", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "DATABASE_URL", "TOKEN_ENCRYPTION_KEY"] as const;

/**
 * - "demo": không có biến nào → dữ liệu mẫu, không đăng nhập.
 * - "configured": đủ cả 5 biến → bật đăng nhập Google.
 * - "misconfigured": thiếu một phần → chặn truy cập (fail closed), không rơi về demo.
 */
export type AuthMode = "demo" | "configured" | "misconfigured";

export function missingAuthEnvVars(): string[] {
  return AUTH_ENV_VARS.filter((name) => !process.env[name]);
}

export function getAuthMode(): AuthMode {
  const missing = missingAuthEnvVars().length;
  if (missing === 0) return "configured";
  if (missing === AUTH_ENV_VARS.length) return "demo";
  return "misconfigured";
}
