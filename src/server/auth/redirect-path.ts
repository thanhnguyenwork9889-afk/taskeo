import "server-only";

/** Độ dài tối đa của đường dẫn chuyển hướng nhận từ client. */
export const MAX_REDIRECT_PATH_LENGTH = 2048;

const SAFE_FALLBACK = "/";
// Ký tự điều khiển (C0 + DEL) và dấu "\" (trình duyệt coi "\" như "/", "/\evil" thành "//evil").
const FORBIDDEN_CHARS = /[\u0000-\u001F\u007F\\]/;

/**
 * Chỉ nhận đường dẫn nội bộ của app làm đích chuyển hướng sau khi đăng nhập Google.
 * Giá trị đến từ form phía client nên không tin: URL tuyệt đối, "//host", "/\host",
 * ký tự điều khiển, quá dài hay không phải chuỗi đều đổi thành "/".
 */
export function toSafeRedirectPath(value: unknown): string {
  if (typeof value !== "string") return SAFE_FALLBACK;
  if (value.length === 0 || value.length > MAX_REDIRECT_PATH_LENGTH) return SAFE_FALLBACK;
  if (!value.startsWith("/") || value.startsWith("//")) return SAFE_FALLBACK;
  if (FORBIDDEN_CHARS.test(value)) return SAFE_FALLBACK;
  return value;
}
