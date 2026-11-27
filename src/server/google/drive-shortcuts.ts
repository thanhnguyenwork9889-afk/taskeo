import "server-only";

// Phạm vi nạp như `drive-files.ts`: `./client` và `googleapis` chỉ được import động trong
// `defaultDeps.getDrive`, sau khi đã thấy scope `drive.file`.
import {
  DRIVE_SHORTCUT_CREATE_FIELDS,
  DRIVE_SHORTCUT_MIME,
  DRIVE_TARGET_FIELDS,
  SHORTCUT_KIND_PROPERTY,
  buildShortcutLookupQuery,
  docKindFromMime,
  pickRawDriveFile,
  toDriveFileName,
  type RawDriveFile,
} from "@/domain/drive-files";
import type { DocKind } from "@/domain/types";

import { runWithDeadline } from "./deadline";
import {
  classifyDriveError,
  driveErrorLogFields,
  driveErrorReason,
  isDriveRateLimitReason,
  isSilentDriveError,
} from "./drive-errors";
import type { DriveFilesClient } from "./drive-folders";
import { DRIVE_TOTAL_TIMEOUT_MS, defaultDeps, type DriveProvisionDeps } from "./drive-provision";

const LOG_MESSAGE = "[google/drive] Không gắn được lối tắt Drive";
const FORBIDDEN_LOG_MESSAGE = "[google/drive] Không đọc được file đích (403, kiểm tra appId Google Picker)";

const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;

export type DriveShortcutResult =
  | { status: "ok"; file: RawDriveFile }
  | { status: "not_connected" }
  | { status: "invalid_target" }
  | { status: "already_attached" }
  | { status: "error" };

export interface DriveShortcutInput {
  /** ID file đích (Google Picker trả về, đã kiểm bằng `driveFileIdSchema` ở nơi gọi). */
  targetId: string;
  /** Thư mục Drive cha (thư mục không gian / dự án). */
  parentId: string;
}

/** Drive trả về lối tắt vừa tạo mà không có `id`. */
export class DriveShortcutMissingIdError extends Error {
  constructor() {
    super("Drive không trả id lối tắt vừa tạo");
    this.name = "DriveShortcutMissingIdError";
  }
}

type TargetCheck = { status: "invalid_target" } | { status: "ok"; name: string; kind: DocKind; parents: string[] };

/** Trường log an toàn: tên lỗi, mã HTTP, và `reason` nếu nằm trong danh sách cố định. */
function logFields(userId: string, error: unknown) {
  const reason = driveErrorReason(error);
  return reason === undefined
    ? { userId, ...driveErrorLogFields(error) }
    : { userId, ...driveErrorLogFields(error), reason };
}

/**
 * Đọc file đích (không bật Shared drives, như các lời gọi Drive khác). Lỗi Google:
 *
 * - 404 → `invalid_target`, không log.
 * - 403 có `reason` giới hạn tốc độ / hạn mức (`rateLimitExceeded`, `userRateLimitExceeded`,
 *   `dailyLimitExceeded`, `quotaExceeded`, `sharingRateLimitExceeded`) → ném tiếp (thành `error`,
 *   log như lỗi thường kèm `reason`): lỗi tạm thời, file đích không sai.
 * - 403 còn lại → `invalid_target`, log một dòng gợi ý appId. Gồm reason quyền (`forbidden`,
 *   `insufficientFilePermissions`, `appNotAuthorizedToFile`) và cả 403 không đọc được / reason
 *   lạ: với scope `drive.file`, 403 không phải rate limit gần như luôn là file chưa được cấp cho
 *   app (appId Picker sai), nên coi là lỗi quyền.
 *
 * Lỗi khác ném tiếp.
 */
async function checkTarget(
  drive: DriveFilesClient,
  targetId: string,
  signal: AbortSignal,
  userId: string,
): Promise<TargetCheck> {
  let data;
  try {
    ({ data } = await drive.files.get(
      { fileId: targetId, fields: DRIVE_TARGET_FIELDS },
      { signal },
    ));
  } catch (error) {
    const info = classifyDriveError(error);
    if (info.kind !== "google") throw error;
    if (info.status === HTTP_NOT_FOUND) return { status: "invalid_target" };
    if (info.status === HTTP_FORBIDDEN) {
      if (isDriveRateLimitReason(driveErrorReason(error))) throw error;
      console.error(FORBIDDEN_LOG_MESSAGE, logFields(userId, error));
      return { status: "invalid_target" };
    }
    throw error;
  }
  const kind = docKindFromMime(data.mimeType);
  if (data.trashed === true || kind === null) return { status: "invalid_target" };
  return { status: "ok", name: toDriveFileName(data.name ?? ""), kind, parents: data.parents ?? [] };
}

/**
 * Gắn file Google Docs / Sheets / Slides có sẵn (user chọn qua Google Picker) vào thư mục
 * `parentId` bằng một lối tắt Drive, trả lối tắt vừa tạo (chỉ các trường `DRIVE_SHORTCUT_CREATE_FIELDS`).
 * Một hạn tổng 10 s, theo thứ tự:
 *
 * 1. Chưa có scope `drive.file` → `not_connected`, không gọi `getDrive` (không nạp `googleapis`).
 * 2. `GoogleNotConnectedError` / `GoogleScopeMissingError` → `not_connected`, không log.
 * 3. Đích 404 / 403 do quyền, đã vào thùng rác hoặc không phải 3 loại Google → `invalid_target`
 *    (403 do rate limit / hạn mức → `error`, xem `checkTarget`).
 * 4. Đích đã nằm trong thư mục, hoặc đã có lối tắt tới nó trong thư mục → `already_attached`.
 * 5. Tạo lối tắt (gắn `appProperties.taskeoTargetKind` để lọc theo loại); thiếu `id` → `error`.
 *
 * Lỗi khác hoặc quá hạn → `error`, log đúng một dòng gồm `userId`, tên lỗi đã phân loại, mã HTTP,
 * `reason` nếu thuộc danh sách cố định (không token / URL / header / message / tên file). Không bao giờ ném. Kiểm-rồi-tạo không nguyên tử: hai
 * request đồng thời có thể tạo hai lối tắt.
 */
export async function attachDriveShortcut(
  userId: string,
  { targetId, parentId }: DriveShortcutInput,
  deps: DriveProvisionDeps = defaultDeps,
): Promise<DriveShortcutResult> {
  const outcome = await runWithDeadline(
    async (signal): Promise<DriveShortcutResult> => {
      if (!(await deps.hasDriveScope(userId))) return { status: "not_connected" };
      signal.throwIfAborted();
      const drive = await deps.getDrive(userId);
      signal.throwIfAborted();

      const target = await checkTarget(drive, targetId, signal, userId);
      if (target.status !== "ok") return target;
      if (target.parents.includes(parentId)) return { status: "already_attached" };
      signal.throwIfAborted();

      const existing = await drive.files.list(
        { q: buildShortcutLookupQuery(targetId, parentId), pageSize: 1, fields: "files(id)", spaces: "drive" },
        { signal },
      );
      if ((existing.data.files ?? []).length > 0) return { status: "already_attached" };
      signal.throwIfAborted();

      const res = await drive.files.create(
        {
          requestBody: {
            name: target.name,
            mimeType: DRIVE_SHORTCUT_MIME,
            parents: [parentId],
            shortcutDetails: { targetId },
            appProperties: { [SHORTCUT_KIND_PROPERTY]: target.kind },
          },
          fields: DRIVE_SHORTCUT_CREATE_FIELDS,
        },
        { signal },
      );
      if (!res.data.id) throw new DriveShortcutMissingIdError();
      return { status: "ok", file: pickRawDriveFile(res.data) };
    },
    deps.totalTimeoutMs ?? DRIVE_TOTAL_TIMEOUT_MS,
    "Quá hạn gắn lối tắt Drive",
  );

  if (outcome.ok) return outcome.value;
  if (isSilentDriveError(classifyDriveError(outcome.error).kind)) return { status: "not_connected" };
  console.error(LOG_MESSAGE, logFields(userId, outcome.error));
  return { status: "error" };
}
