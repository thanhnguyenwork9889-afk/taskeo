import "server-only";

// Phạm vi nạp như `drive-provision.ts`: `./client` và `googleapis` chỉ được import động trong
// `defaultDeps.getDrive`, sau khi đã thấy scope `drive.file`. `about.get` dùng được với scope
// `drive.file` sẵn có — không thêm scope mới.
import { parseStorageQuota } from "@/domain/drive-storage";
import type { DriveStorage } from "@/domain/types";

import { runWithDeadline } from "./deadline";
import { classifyDriveError, driveErrorLogFields, isSilentDriveError } from "./drive-errors";
import { DRIVE_TOTAL_TIMEOUT_MS, defaultDeps, type DriveProvisionDeps } from "./drive-provision";

/** Chỉ xin `storageQuota` của `about.get`. */
export const DRIVE_STORAGE_FIELDS = "storageQuota";

const LOG_MESSAGE = "[google/drive] Không lấy được dung lượng Drive";

export type DriveStorageResult =
  | { status: "ok"; storage: DriveStorage }
  | { status: "not_connected" }
  | { status: "error" };

/** Drive trả `storageQuota` thiếu / sai hình dạng. Chỉ `name` được log. */
class MalformedStorageQuotaError extends Error {
  constructor() {
    super("Drive trả storageQuota không hợp lệ");
    this.name = "MalformedStorageQuotaError";
  }
}

/**
 * Dung lượng Google của user qua Drive `about.get` (`fields=storageQuota`).
 *
 * - Chưa có scope `drive.file` → `not_connected`, không gọi `getDrive` (không nạp `googleapis`).
 * - `GoogleNotConnectedError` / `GoogleScopeMissingError` → `not_connected`, không log.
 * - `storageQuota` thiếu / sai (xem `parseStorageQuota`) → `error`, log `MalformedStorageQuotaError`.
 * - Lỗi khác hoặc quá hạn tổng 10 s → `error`, log đúng một dòng gồm `userId`, tên lỗi đã phân
 *   loại và mã HTTP (không bao giờ `message` / `config` / URL / token).
 *
 * Không bao giờ ném. Hết hạn thì request đang bay bị huỷ; kết quả muộn bị bỏ qua.
 */
export async function getDriveStorageQuota(
  userId: string,
  deps: DriveProvisionDeps = defaultDeps,
): Promise<DriveStorageResult> {
  const outcome = await runWithDeadline(
    async (signal): Promise<DriveStorage | null> => {
      if (!(await deps.hasDriveScope(userId))) return null;
      signal.throwIfAborted();
      const drive = await deps.getDrive(userId);
      signal.throwIfAborted();
      const res = await drive.about.get({ fields: DRIVE_STORAGE_FIELDS }, { signal });
      const storage = parseStorageQuota(res.data.storageQuota);
      if (storage === null) throw new MalformedStorageQuotaError();
      return storage;
    },
    deps.totalTimeoutMs ?? DRIVE_TOTAL_TIMEOUT_MS,
    "Quá hạn lấy dung lượng Drive",
  );

  if (outcome.ok) {
    return outcome.value === null ? { status: "not_connected" } : { status: "ok", storage: outcome.value };
  }
  if (isSilentDriveError(classifyDriveError(outcome.error).kind)) return { status: "not_connected" };
  console.error(LOG_MESSAGE, { userId, ...driveErrorLogFields(outcome.error) });
  return { status: "error" };
}
