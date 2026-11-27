import "server-only";
import { prisma } from "@/server/db";
import { provisionProjectFolder, provisionSpaceFolder } from "@/server/google/drive-provision";

/**
 * Cấu hình log cho phần Drive: `prefix` đứng đầu thông điệp (ví dụ `"[projects]"`), `context` gộp
 * thêm vào object log (ví dụ `projectId` của dự án vừa tạo). Log luôn có `userId`, `spaceId`.
 */
export interface DriveFolderLog {
  prefix: string;
  context?: Record<string, string>;
}

export interface SpaceFolderTarget {
  id: string;
  name: string;
  driveFolderId: string | null;
}

export interface ProjectFolderTarget {
  id: string;
  name: string;
  driveFolderId: string | null;
}

type LogContext = Record<string, string>;

/** Log lỗi DB phần Drive: chỉ tên lỗi, không `message` (có thể chứa dữ liệu / chi tiết Prisma). */
function logDriveDbError(message: string, logContext: LogContext, error: unknown): void {
  console.error(message, { ...logContext, error: error instanceof Error ? error.name : "unknown" });
}

/**
 * Chạy một lệnh ghi id thư mục Drive best-effort: lỗi chỉ log an toàn
 * (`"<prefix> Không lưu được driveFolderId"`), không ném.
 */
export async function saveDriveFolderId(
  write: () => Promise<unknown>,
  log: DriveFolderLog,
  logContext: LogContext,
): Promise<void> {
  try {
    await write();
  } catch (error) {
    logDriveDbError(`${log.prefix} Không lưu được driveFolderId`, logContext, error);
  }
}

/** Đọc lại id đã lưu; lỗi → log an toàn, `null`. */
async function rereadDriveFolderId(
  read: () => Promise<{ driveFolderId: string | null } | null>,
  message: string,
  logContext: LogContext,
): Promise<string | null> {
  try {
    const stored = await read();
    return stored?.driveFolderId ?? null;
  } catch (error) {
    logDriveDbError(message, logContext, error);
    return null;
  }
}

/**
 * Id thư mục Drive của không gian. Chưa có → tạo bù, ghi có điều kiện (`driveFolderId: null`, không
 * đè id ghi đồng thời) rồi đọc lại id đã lưu: request thua cuộc đua dùng thư mục của request thắng
 * (thư mục của nó thành thư mục rỗng mồ côi — chấp nhận), để thư mục con luôn nằm trong thư mục mà
 * `Space.driveFolderId` trỏ tới. `null` khi không tạo được, đọc lại lỗi hoặc không gian đã bị xoá.
 * Không bao giờ ném.
 */
export async function ensureSpaceFolderId(
  userId: string,
  space: SpaceFolderTarget,
  log: DriveFolderLog,
): Promise<string | null> {
  if (space.driveFolderId) return space.driveFolderId;
  const logContext = { userId, spaceId: space.id, ...log.context };
  const created = await provisionSpaceFolder(userId, { id: space.id, name: space.name });
  if (!created) return null;
  await saveDriveFolderId(
    () =>
      prisma.space.updateMany({
        where: { id: space.id, userId, driveFolderId: null },
        data: { driveFolderId: created },
      }),
    log,
    logContext,
  );
  return rereadDriveFolderId(
    () => prisma.space.findFirst({ where: { id: space.id, userId }, select: { driveFolderId: true } }),
    `${log.prefix} Không đọc lại được driveFolderId của không gian`,
    logContext,
  );
}

/**
 * Id thư mục Drive của dự án (nằm trong thư mục không gian). Chưa có → lấy thư mục không gian qua
 * `ensureSpaceFolderId` (tạo bù nếu cần), tạo thư mục dự án, ghi có điều kiện rồi đọc lại — cùng
 * cách xử lý cuộc đua như không gian. `project` phải thuộc `space` (nơi gọi đã kiểm).
 * `null` khi bất kỳ bước nào không thành; không bao giờ ném.
 */
export async function ensureProjectFolderId(
  userId: string,
  target: { space: SpaceFolderTarget; project: ProjectFolderTarget },
  log: DriveFolderLog,
): Promise<string | null> {
  const { space, project } = target;
  if (project.driveFolderId) return project.driveFolderId;
  const projectLog = { ...log, context: { projectId: project.id, ...log.context } };
  const parentFolderId = await ensureSpaceFolderId(userId, space, projectLog);
  if (!parentFolderId) return null;
  const created = await provisionProjectFolder(userId, {
    spaceId: space.id,
    parentFolderId,
    project: { id: project.id, name: project.name },
  });
  if (!created) return null;
  const logContext = { userId, spaceId: space.id, ...projectLog.context };
  await saveDriveFolderId(
    () =>
      prisma.project.updateMany({
        where: { id: project.id, userId, driveFolderId: null },
        data: { driveFolderId: created },
      }),
    log,
    logContext,
  );
  return rereadDriveFolderId(
    () => prisma.project.findFirst({ where: { id: project.id, userId }, select: { driveFolderId: true } }),
    `${log.prefix} Không đọc lại được driveFolderId của dự án`,
    logContext,
  );
}
