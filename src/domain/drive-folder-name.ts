/** Độ dài tối đa (tính theo code point) của tên thư mục Drive do Taskeo tạo. */
export const DRIVE_FOLDER_NAME_MAX = 200;

/** Tên thư mục mặc định khi tên không gian rỗng sau chuẩn hoá. */
export const DEFAULT_SPACE_FOLDER_NAME = "Không gian không tên";

/** Tên thư mục mặc định khi tên dự án rỗng sau chuẩn hoá. */
export const DEFAULT_PROJECT_FOLDER_NAME = "Dự án không tên";

const INVISIBLE_CHARS = /[\p{Cc}\p{Cf}]/gu;
const WHITESPACE_RUN = /\s+/gu;

/**
 * Chuẩn hoá tên không gian / dự án thành tên thư mục Drive: NFC, ký tự điều khiển / vô hình → khoảng trắng,
 * gộp khoảng trắng, trim, cắt `DRIVE_FOLDER_NAME_MAX` code point (không cắt đôi emoji), rỗng → `fallback`.
 */
export function toDriveFolderName(raw: string, fallback: string): string {
  const cleaned = raw.normalize("NFC").replace(INVISIBLE_CHARS, " ").replace(WHITESPACE_RUN, " ").trim();
  const cut = Array.from(cleaned).slice(0, DRIVE_FOLDER_NAME_MAX).join("").trim();
  return cut === "" ? fallback : cut;
}
