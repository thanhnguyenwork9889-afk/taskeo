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

/**
 * Biến cho Google Picker (T018). Tuỳ chọn: thiếu thì nút Picker báo chưa cấu hình,
 * KHÔNG ảnh hưởng `getAuthMode` (không nằm trong `AUTH_ENV_VARS`).
 */
export const PICKER_ENV_VARS = ["GOOGLE_PICKER_API_KEY", "GOOGLE_CLOUD_PROJECT_NUMBER"] as const;
export type PickerEnvVar = (typeof PICKER_ENV_VARS)[number];

export interface PickerConfig {
  /** API key giới hạn Google Picker API + HTTP referrer; được gửi ra trình duyệt. */
  developerKey: string;
  /** Project number của Google Cloud project chứa OAuth client (chỉ chữ số). */
  appId: string;
}

const PROJECT_NUMBER_PATTERN = /^\d+$/;

/**
 * Đọc cấu hình Picker. Thiếu / rỗng / chỉ khoảng trắng / project number không toàn chữ số → `null`.
 * Chỉ route server gọi hàm này (file không import "server-only" vì proxy dùng chung).
 */
export function readPickerConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): PickerConfig | null {
  const developerKey = env.GOOGLE_PICKER_API_KEY?.trim() ?? "";
  const appId = env.GOOGLE_CLOUD_PROJECT_NUMBER?.trim() ?? "";
  if (developerKey === "" || !PROJECT_NUMBER_PATTERN.test(appId)) return null;
  return { developerKey, appId };
}
