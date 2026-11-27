import "server-only";

// Phạm vi nạp như `drive-provision.ts`: `./client` và `googleapis` chỉ được import động trong
// `defaultDeps.getDrive`, sau khi đã thấy scope `drive.file`. Module này chỉ được nạp (động) từ
// tầng truy vấn ở chế độ `configured`.
import {
  DOC_KIND_MIME,
  DRIVE_FILE_CREATE_FIELDS,
  pickRawDriveFile,
  type RawDriveFile,
} from "@/domain/drive-files";
import type { DocKind } from "@/domain/types";

import { runWithDeadline } from "./deadline";
import { classifyDriveError, driveErrorLogFields, isSilentDriveError } from "./drive-errors";
import { DRIVE_TOTAL_TIMEOUT_MS, defaultDeps, type DriveProvisionDeps } from "./drive-provision";

/**
 * Chỉ các trường cần để ánh xạ sang `DriveFileItem` (xem `toDriveFileItem`); `shortcutDetails` để
 * phân giải lối tắt về file đích.
 */
export const DRIVE_LIST_FIELDS =
  "files(id,name,mimeType,modifiedTime,webViewLink,parents,shortcutDetails(targetId,targetMimeType))";

const LOG_MESSAGE = "[google/drive] Không liệt kê được file Drive";
const CREATE_LOG_MESSAGE = "[google/drive] Không tạo được file Drive";

export type DriveListResult =
  | { status: "ok"; files: RawDriveFile[] }
  | { status: "not_connected" }
  | { status: "error" };

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
      return pages.flatMap((page) => (page.data.files ?? []).map(pickRawDriveFile));
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

export type DriveCreateResult =
  | { status: "ok"; file: RawDriveFile }
  | { status: "not_connected" }
  | { status: "error" };

export interface DriveCreateInput {
  /** Đã chuẩn hoá ở nơi gọi (xem `toDriveFileName`). */
  name: string;
  kind: DocKind;
  /** Thư mục Drive cha (thư mục dự án). */
  parentId: string;
}

/** Drive trả về file vừa tạo mà không có `id`. */
export class DriveFileMissingIdError extends Error {
  constructor() {
    super("Drive không trả id file vừa tạo");
    this.name = "DriveFileMissingIdError";
  }
}

/**
 * Tạo một Google Doc / Sheet / Slide rỗng trong thư mục `parentId`, trả file (chỉ các trường
 * `DRIVE_FILE_CREATE_FIELDS`). Cùng khuôn với `listDriveFiles`:
 *
 * - Chưa có scope `drive.file` → `not_connected`, không gọi `getDrive` (không nạp `googleapis`).
 * - `GoogleNotConnectedError` / `GoogleScopeMissingError` → `not_connected`, không log.
 * - Drive không trả `id`, lỗi khác hoặc quá hạn tổng 10 s → `error`, log đúng một dòng an toàn.
 *
 * Không bao giờ ném.
 */
export async function createDriveFile(
  userId: string,
  { name, kind, parentId }: DriveCreateInput,
  deps: DriveProvisionDeps = defaultDeps,
): Promise<DriveCreateResult> {
  const outcome = await runWithDeadline(
    async (signal): Promise<RawDriveFile | null> => {
      if (!(await deps.hasDriveScope(userId))) return null;
      signal.throwIfAborted();
      const drive = await deps.getDrive(userId);
      signal.throwIfAborted();
      const res = await drive.files.create(
        {
          requestBody: { name, mimeType: DOC_KIND_MIME[kind], parents: [parentId] },
          fields: DRIVE_FILE_CREATE_FIELDS,
        },
        { signal },
      );
      if (!res.data.id) throw new DriveFileMissingIdError();
      return pickRawDriveFile(res.data);
    },
    deps.totalTimeoutMs ?? DRIVE_TOTAL_TIMEOUT_MS,
    "Quá hạn tạo file Drive",
  );

  if (outcome.ok) {
    return outcome.value === null ? { status: "not_connected" } : { status: "ok", file: outcome.value };
  }
  if (isSilentDriveError(classifyDriveError(outcome.error).kind)) return { status: "not_connected" };
  console.error(CREATE_LOG_MESSAGE, { userId, ...driveErrorLogFields(outcome.error) });
  return { status: "error" };
}
