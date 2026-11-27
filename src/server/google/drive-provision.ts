import "server-only";

// Không import tĩnh `./client` hay `googleapis`: nạp module này (và gọi nó cho user chưa có
// drive.file, hoặc ở chế độ demo) không bao giờ kéo theo `googleapis`. Hai module đó chỉ được
// import động trong `defaultDeps.getDrive`, sau khi đã thấy scope.
import {
  DEFAULT_PROJECT_FOLDER_NAME,
  DEFAULT_SPACE_FOLDER_NAME,
  toDriveFolderName,
} from "@/domain/drive-folder-name";

import { classifyDriveError, driveErrorLogFields, isSilentDriveError } from "./drive-errors";
import { createFolder, ensureRootFolder, type DriveFilesClient } from "./drive-folders";
import { hasGoogleScope } from "./granted-scopes";
import { GOOGLE_SCOPES } from "./scopes";

/** Timeout cho mỗi request HTTP tới Drive API. */
export const DRIVE_REQUEST_TIMEOUT_MS = 5_000;

/** Hạn tổng cho cả chuỗi kiểm tra scope → lấy client → tạo thư mục. */
export const DRIVE_TOTAL_TIMEOUT_MS = 10_000;

const LOG_MESSAGE = "[google/drive] Không tạo được thư mục Drive";

export interface DriveProvisionDeps {
  /** User đã cấp scope `drive.file` chưa. */
  hasDriveScope(userId: string): Promise<boolean>;
  /** Client Drive v3 theo user. Có thể ném `GoogleNotConnectedError`. */
  getDrive(userId: string): Promise<DriveFilesClient>;
  /** Ghi đè `DRIVE_TOTAL_TIMEOUT_MS` (dùng cho test). */
  totalTimeoutMs?: number;
}

export const defaultDeps: DriveProvisionDeps = {
  hasDriveScope: (userId) => hasGoogleScope(userId, GOOGLE_SCOPES.drive),
  async getDrive(userId) {
    const { getGoogleAuth } = await import("./client");
    const auth = await getGoogleAuth(userId);
    const { google } = await import("googleapis");
    // retry: false — googleapis mặc định retry GET khi 5xx/429, làm request tạo không gian treo lâu.
    return google.drive({ version: "v3", auth, timeout: DRIVE_REQUEST_TIMEOUT_MS, retry: false });
  },
};

function timeoutError(): Error {
  const error = new Error("Quá hạn tạo thư mục Drive");
  error.name = "TimeoutError";
  return error;
}

/**
 * Chạy `work` trong hạn tổng; không bao giờ ném. Lỗi được phân loại: chưa kết nối / thiếu scope
 * thì im lặng, còn lại log đúng một dòng chỉ gồm `logContext`, tên lỗi đã phân loại và mã HTTP.
 * Không log `message` / `config` / `url` của lỗi (gaxios mang header Authorization trong đó).
 */
async function runBestEffort(
  work: () => Promise<void>,
  deps: DriveProvisionDeps,
  logContext: { userId: string; spaceId: string; projectId?: string },
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(timeoutError()), deps.totalTimeoutMs ?? DRIVE_TOTAL_TIMEOUT_MS);
  });
  try {
    // `work()` trong async wrapper: lỗi ném đồng bộ cũng thành promise bị từ chối.
    await Promise.race([(async () => work())(), deadline]);
  } catch (error) {
    if (isSilentDriveError(classifyDriveError(error).kind)) return;
    console.error(LOG_MESSAGE, { ...logContext, ...driveErrorLogFields(error) });
  } finally {
    clearTimeout(timer);
  }
}

function createSpaceFolder(
  drive: DriveFilesClient,
  rootId: string,
  space: { id: string; name: string },
): Promise<string> {
  return createFolder(drive, {
    name: toDriveFolderName(space.name, DEFAULT_SPACE_FOLDER_NAME),
    parentId: rootId,
    appProperties: { taskeoRole: "space", taskeoSpaceId: space.id },
  });
}

/**
 * Tạo thư mục Drive cho không gian (trong thư mục gốc "Taskeo" của app), best-effort.
 * Trả id thư mục, hoặc `null` khi user chưa có `drive.file`, chưa kết nối, Google lỗi hay quá hạn.
 * Không bao giờ ném. Nơi gọi tự ghi `Space.driveFolderId`.
 */
export async function provisionSpaceFolder(
  userId: string,
  space: { id: string; name: string },
  deps: DriveProvisionDeps = defaultDeps,
): Promise<string | null> {
  let folderId: string | null = null;
  await runBestEffort(
    async () => {
      if (!(await deps.hasDriveScope(userId))) return;
      const drive = await deps.getDrive(userId);
      const rootId = await ensureRootFolder(drive);
      folderId = await createSpaceFolder(drive, rootId, space);
    },
    deps,
    { userId, spaceId: space.id },
  );
  return folderId;
}

/**
 * Tạo thư mục Drive cho dự án bên trong thư mục không gian, best-effort. Không bao giờ ném.
 *
 * - `space.driveFolderId` có giá trị → dùng làm thư mục cha (không gọi tới thư mục gốc).
 * - Chưa có → bảo đảm thư mục gốc, tạo bù thư mục không gian, rồi tạo thư mục dự án trong đó.
 *
 * Kết quả:
 * - `spaceFolderId`: id thư mục không gian **vừa được tạo bù trong lần gọi này** — nơi gọi phải
 *   lưu vào `Space.driveFolderId` (ghi có điều kiện `driveFolderId: null`). `null` khi không gian
 *   đã có thư mục từ trước, hoặc tạo bù không thành công. Vẫn trả id này nếu thư mục không gian
 *   đã tạo được nhưng bước tạo thư mục dự án lỗi / quá hạn, để không mất liên kết.
 * - `projectFolderId`: id thư mục dự án, `null` khi không tạo được.
 */
export async function provisionProjectFolder(
  userId: string,
  input: {
    space: { id: string; name: string; driveFolderId: string | null };
    project: { id: string; name: string };
  },
  deps: DriveProvisionDeps = defaultDeps,
): Promise<{ spaceFolderId: string | null; projectFolderId: string | null }> {
  const { space, project } = input;
  let spaceFolderId: string | null = null;
  let projectFolderId: string | null = null;
  await runBestEffort(
    async () => {
      if (!(await deps.hasDriveScope(userId))) return;
      const drive = await deps.getDrive(userId);
      let parentId = space.driveFolderId;
      if (!parentId) {
        const rootId = await ensureRootFolder(drive);
        parentId = await createSpaceFolder(drive, rootId, space);
        spaceFolderId = parentId;
      }
      const id = await createFolder(drive, {
        name: toDriveFolderName(project.name, DEFAULT_PROJECT_FOLDER_NAME),
        parentId,
        appProperties: { taskeoRole: "project", taskeoProjectId: project.id },
      });
      projectFolderId = id;
    },
    deps,
    { userId, spaceId: space.id, projectId: project.id },
  );
  // Chuỗi bị bỏ sau hạn tổng có thể chạy tiếp, nhưng giá trị trả về đã chốt tại đây.
  return { spaceFolderId, projectFolderId };
}
