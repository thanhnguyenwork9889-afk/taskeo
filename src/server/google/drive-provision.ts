import "server-only";

// Phạm vi nạp: module này chỉ được import từ `@/server/spaces` và `@/server/projects`, mà hai
// module đó chỉ được route import động ở chế độ `configured` — chế độ demo không bao giờ nạp nó.
// Import tĩnh duy nhất có I/O là `./granted-scopes` (Prisma). `./client` và `googleapis` KHÔNG
// được import tĩnh: chúng chỉ được import động trong `defaultDeps.getDrive`, sau khi đã thấy
// scope `drive.file`, nên user chưa kết nối Drive không bao giờ kéo theo `googleapis`.
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
 *
 * Hết hạn: `controller.abort(TimeoutError)` huỷ request Drive đang chạy (signal được chuyển tới
 * gaxios) và chặn mọi lời gọi Drive tiếp theo (`throwIfAborted` trước mỗi bước), rồi trả về ngay.
 * Kết quả muộn của `work` (resolve hay reject) bị bỏ qua: không đổi giá trị trả về, không log thêm,
 * không thành unhandled rejection (`Promise.race` đã gắn handler).
 *
 * Giới hạn: bước refresh token trong `getGoogleAuth` không nhận signal, nên có thể chạy tiếp ở
 * nền (bị chặn bởi timeout mỗi lần thử của OAuth2), nhưng sau khi huỷ sẽ không thư mục nào được tạo.
 */
async function runBestEffort(
  work: (signal: AbortSignal) => Promise<void>,
  deps: DriveProvisionDeps,
  logContext: { userId: string; spaceId: string; projectId?: string },
): Promise<void> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = timeoutError();
      controller.abort(error);
      reject(error);
    }, deps.totalTimeoutMs ?? DRIVE_TOTAL_TIMEOUT_MS);
  });
  try {
    // `work()` trong async wrapper: lỗi ném đồng bộ cũng thành promise bị từ chối.
    await Promise.race([(async () => work(controller.signal))(), deadline]);
  } catch (error) {
    // Đã huỷ vì hết hạn thì luôn báo TimeoutError, kể cả khi lỗi về trước là AbortError của gaxios.
    const reported: unknown = controller.signal.aborted ? controller.signal.reason : error;
    if (isSilentDriveError(classifyDriveError(reported).kind)) return;
    console.error(LOG_MESSAGE, { ...logContext, ...driveErrorLogFields(reported) });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Tạo thư mục Drive cho không gian (trong thư mục gốc "Taskeo" của app), best-effort.
 * Trả id thư mục, hoặc `null` khi user chưa có `drive.file`, chưa kết nối, Google lỗi hay quá hạn.
 * Không bao giờ ném. Nơi gọi tự ghi `Space.driveFolderId`.
 *
 * Cũng dùng để tạo bù thư mục cho không gian cũ khi tạo dự án — xem `provisionProjectFolder`.
 */
export async function provisionSpaceFolder(
  userId: string,
  space: { id: string; name: string },
  deps: DriveProvisionDeps = defaultDeps,
): Promise<string | null> {
  let folderId: string | null = null;
  await runBestEffort(
    async (signal) => {
      if (!(await deps.hasDriveScope(userId))) return;
      signal.throwIfAborted();
      const drive = await deps.getDrive(userId);
      const rootId = await ensureRootFolder(drive, { signal });
      const id = await createFolder(
        drive,
        {
          name: toDriveFolderName(space.name, DEFAULT_SPACE_FOLDER_NAME),
          parentId: rootId,
          appProperties: { taskeoRole: "space", taskeoSpaceId: space.id },
        },
        { signal },
      );
      if (!signal.aborted) folderId = id;
    },
    deps,
    { userId, spaceId: space.id },
  );
  return folderId;
}

/**
 * Tạo thư mục Drive cho dự án bên trong `parentFolderId` (thư mục của không gian), best-effort.
 * Chỉ tạo đúng một thư mục: không tìm thư mục gốc, không tạo bù thư mục không gian.
 * Trả id thư mục dự án, hoặc `null` khi chưa có `drive.file`, chưa kết nối, Google lỗi hay quá hạn.
 * Không bao giờ ném; log (nếu có) gồm `spaceId` và `projectId`.
 *
 * Luồng ở nơi gọi (`createProject`), khi không gian chưa có `driveFolderId`:
 * 1. `provisionSpaceFolder` tạo thư mục không gian;
 * 2. ghi có điều kiện `Space.driveFolderId` (chỉ khi vẫn `null`);
 * 3. đọc lại `Space.driveFolderId` đã lưu và dùng giá trị đó làm `parentFolderId`.
 * Nhờ bước 3, khi hai request tạo dự án chạy đồng thời, request thua vẫn đặt thư mục dự án dưới
 * thư mục không gian của request thắng (thư mục không gian của request thua thành mồ côi, rỗng),
 * nên `Project.driveFolderId` luôn nằm trong thư mục không gian được lưu.
 */
export async function provisionProjectFolder(
  userId: string,
  input: { spaceId: string; parentFolderId: string; project: { id: string; name: string } },
  deps: DriveProvisionDeps = defaultDeps,
): Promise<string | null> {
  const { spaceId, parentFolderId, project } = input;
  let folderId: string | null = null;
  await runBestEffort(
    async (signal) => {
      if (!(await deps.hasDriveScope(userId))) return;
      signal.throwIfAborted();
      const drive = await deps.getDrive(userId);
      const id = await createFolder(
        drive,
        {
          name: toDriveFolderName(project.name, DEFAULT_PROJECT_FOLDER_NAME),
          parentId: parentFolderId,
          appProperties: { taskeoRole: "project", taskeoProjectId: project.id },
        },
        { signal },
      );
      if (!signal.aborted) folderId = id;
    },
    deps,
    { userId, spaceId, projectId: project.id },
  );
  return folderId;
}
