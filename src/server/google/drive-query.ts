import "server-only";

/** mimeType của thư mục Google Drive. */
export const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";

/**
 * Thoát giá trị đặt trong dấu nháy đơn của chuỗi `q` (Drive API v3).
 * Thoát `\` trước rồi mới tới `'`, để `\` vừa thêm cho `'` không bị nhân đôi.
 */
export function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** Điều kiện `appProperties has { key='<k>' and value='<v>' }`, đã thoát cả key và value. */
export function appPropertyQuery(key: string, value: string): string {
  return `appProperties has { key='${escapeDriveQueryValue(key)}' and value='${escapeDriveQueryValue(value)}' }`;
}

/** Chuỗi `q` tìm thư mục gốc "Taskeo" của app (chưa vào thùng rác). */
export function rootFolderQuery(): string {
  return [
    `mimeType='${escapeDriveQueryValue(DRIVE_FOLDER_MIME)}'`,
    appPropertyQuery("taskeoRole", "root"),
    "trashed=false",
  ].join(" and ");
}
