import "server-only";
import { escapeDriveQueryValue } from "@/domain/drive-files";

/** mimeType của thư mục Google Drive. */
export const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";

// Hàm thuần, chuyển sang domain (T015) để client và server dùng chung; giữ export ở đây cho code cũ.
export { escapeDriveQueryValue } from "@/domain/drive-files";

/** Điều kiện `appProperties has { key='<k>' and value='<v>' }`, đã thoát cả key và value. */
export function appPropertyQuery(key: string, value: string): string {
  return `appProperties has { key='${escapeDriveQueryValue(key)}' and value='${escapeDriveQueryValue(value)}' }`;
}

/**
 * Chuỗi `q` tìm thư mục gốc "Taskeo" của app: chưa vào thùng rác và do chính user sở hữu
 * (`'me' in owners`). Lọc chủ sở hữu để khi có Google Picker, một thư mục "Taskeo" người khác
 * chia sẻ (cũng mang appProperties của app) không bị chọn làm gốc.
 */
export function rootFolderQuery(): string {
  return [
    `mimeType='${escapeDriveQueryValue(DRIVE_FOLDER_MIME)}'`,
    appPropertyQuery("taskeoRole", "root"),
    "trashed=false",
    "'me' in owners",
  ].join(" and ");
}
