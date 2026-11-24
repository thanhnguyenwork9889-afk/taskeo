// Không import "server-only" để proxy.ts dùng chung được. Chỉ đọc tên biến, không đọc giá trị ra ngoài.
import { getAppEnv, type AppEnv } from "./app";

export const AUTH_ENV_VARS = ["AUTH_SECRET", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "DATABASE_URL", "TOKEN_ENCRYPTION_KEY"] as const;
export type AuthEnvVar = (typeof AUTH_ENV_VARS)[number];

/**
 * - "demo": chỉ khi thiếu toàn bộ biến, appEnv === "development" VÀ bản build không phải production
 *   (NODE_ENV !== "production") → dữ liệu mẫu, không đăng nhập. Hai điều kiện cùng lúc để một bản
 *   build production lỡ đặt NEXT_PUBLIC_APP_ENV=development không mở toang app.
 * - "configured": đủ cả 5 biến → bật đăng nhập Google.
 * - "misconfigured": thiếu một phần, hoặc thiếu toàn bộ ở production / bản build production
 *   → chặn truy cập (fail closed), không bao giờ rơi về demo.
 */
export type AuthMode = "demo" | "configured" | "misconfigured";

export function missingAuthEnvVars(): AuthEnvVar[] {
  return AUTH_ENV_VARS.filter((name) => !process.env[name]);
}

/** Hàm thuần để test: quyết định chế độ từ môi trường, danh sách biến thiếu và NODE_ENV của bản build. */
export function resolveAuthMode(appEnv: AppEnv, missing: readonly AuthEnvVar[], nodeEnv?: string): AuthMode {
  if (missing.length === 0) return "configured";
  const allMissing = AUTH_ENV_VARS.every((name) => missing.includes(name));
  if (allMissing && appEnv === "development" && nodeEnv !== "production") return "demo";
  return "misconfigured";
}

export function getAuthMode(): AuthMode {
  // Truy cập literal process.env.NODE_ENV để bundler thay giá trị lúc build.
  return resolveAuthMode(getAppEnv(), missingAuthEnvVars(), process.env.NODE_ENV);
}
