// Không import "server-only" để proxy.ts dùng chung được. Chỉ đọc tên biến, không đọc giá trị ra ngoài.
import { getAppEnv, type AppEnv } from "./app";

export const AUTH_ENV_VARS = ["AUTH_SECRET", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "DATABASE_URL", "TOKEN_ENCRYPTION_KEY"] as const;

/**
 * - "demo": chỉ ở development và không có biến nào → dữ liệu mẫu, không đăng nhập.
 * - "configured": đủ cả 5 biến → bật đăng nhập Google.
 * - "misconfigured": thiếu một phần, hoặc thiếu toàn bộ ở staging / production → chặn truy cập
 *   (fail closed), không bao giờ rơi về demo.
 */
export type AuthMode = "demo" | "configured" | "misconfigured";

export function missingAuthEnvVars(): string[] {
  return AUTH_ENV_VARS.filter((name) => !process.env[name]);
}

/** Hàm thuần để test: quyết định chế độ từ môi trường và danh sách biến thiếu. */
export function resolveAuthMode(appEnv: AppEnv, missing: readonly string[]): AuthMode {
  if (missing.length === 0) return "configured";
  const allMissing = AUTH_ENV_VARS.every((name) => missing.includes(name));
  if (allMissing && appEnv === "development") return "demo";
  return "misconfigured";
}

export function getAuthMode(): AuthMode {
  return resolveAuthMode(getAppEnv(), missingAuthEnvVars());
}
