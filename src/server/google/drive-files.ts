import "server-only";

// Phạm vi nạp như `drive-provision.ts`: `./client` và `googleapis` chỉ được import động trong
// `defaultDeps.getDrive`, sau khi đã thấy scope `drive.file`. Module này chỉ được nạp (động) từ
// tầng truy vấn ở chế độ `configured`.
import type { RawDriveFile } from "@/domain/drive-files";

import { runWithDeadline } from "./deadline";
import { classifyDriveError, driveErrorLogFields, isSilentDriveError } from "./drive-errors";
import { DRIVE_TOTAL_TIMEOUT_MS, defaultDeps, type DriveProvisionDeps } from "./drive-provision";

/** Chỉ các trường cần để ánh xạ sang `DriveFileItem` (xem `toDriveFileItem`). */
export const DRIVE_LIST_FIELDS = "files(id,name,mimeType,modifiedTime,webViewLink,parents)";

const LOG_MESSAGE = "[google/drive] Không liệt kê được file Drive";

export type DriveListResult =
  | { status: "ok"; files: RawDriveFile[] }
  | { status: "not_connected" }
  | { status: "error" };

/** Chỉ giữ đúng các trường đã xin trong `fields`, kể cả khi Drive trả thêm. */
function toRawDriveFile(file: RawDriveFile): RawDriveFile {
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    modifiedTime: file.modifiedTime,
    webViewLink: file.webViewLink,
    parents: file.parents,
  };
}

/**
 * Liệt kê file Drive cho từng chuỗi `q` (song song), nối kết quả theo thứ tự `queries`.
 * Mỗi `q` một trang `files.list` (`orderBy: modifiedTime desc`, tối đa `pageSize` file, không
 * phân trang tiếp). Không khử trùng, không lọc: nơi gọi dùng `mergeRecent` / `toDriveFileItem`.
 * `queries` phải dựng bằng `buildDriveFilesQuery` (đã thoát giá trị); `pageSize` do nơi gọi kiểm
 * (Drive nhận 1–1000).
 *
 * - `queries` rỗng → `ok` với `[]`, không kiểm scope, không I/O nào (không có gì để hỏi Google;
 *   nơi gọi chỉ truyền rỗng khi user chưa có thư mục Drive nào).
 * - Chưa có scope `drive.file` → `not_connected`, không gọi `getDrive` (không nạp `googleapis`).
 * - `GoogleNotConnectedError` / `GoogleScopeMissingError` → `not_connected`, không log.
 * - Lỗi khác hoặc quá hạn tổng 10 s → `error`, log đúng một dòng gồm `userId`, tên lỗi đã phân
 *   loại và mã HTTP (không bao giờ `message` / `config` / URL / token).
 *
 * Không bao giờ ném. Hết hạn (hoặc một `q` lỗi) thì các request còn đang bay bị huỷ; kết quả
 * muộn bị bỏ qua.
 */
export async function listDriveFiles(
  userId: string,
  queries: string[],
  pageSize: number,
  deps: DriveProvisionDeps = defaultDeps,
): Promise<DriveListResult> {
  if (queries.length === 0) return { status: "ok", files: [] };

  const outcome = await runWithDeadline(
    async (signal): Promise<RawDriveFile[] | null> => {
      if (!(await deps.hasDriveScope(userId))) return null;
      signal.throwIfAborted();
      const drive = await deps.getDrive(userId);
      signal.throwIfAborted();
      const pages = await Promise.all(
        queries.map((q) =>
          drive.files.list(
            { q, orderBy: "modifiedTime desc", pageSize, fields: DRIVE_LIST_FIELDS, spaces: "drive" },
            { signal },
          ),
        ),
      );
      return pages.flatMap((page) => (page.data.files ?? []).map(toRawDriveFile));
    },
    deps.totalTimeoutMs ?? DRIVE_TOTAL_TIMEOUT_MS,
    "Quá hạn liệt kê file Drive",
  );

  if (outcome.ok) {
    return outcome.value === null ? { status: "not_connected" } : { status: "ok", files: outcome.value };
  }
  if (isSilentDriveError(classifyDriveError(outcome.error).kind)) return { status: "not_connected" };
  console.error(LOG_MESSAGE, { userId, ...driveErrorLogFields(outcome.error) });
  return { status: "error" };
}
