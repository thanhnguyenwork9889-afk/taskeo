import { connection } from "next/server";
import { DRIVE_NOT_CONNECTED_CODE } from "@/domain/drive-files";
import type { DriveStorageResponse } from "@/domain/types";
import { getApiUserId } from "@/server/auth/session";
import { fail, failWithCode, handleUnexpected, ok, unauthorized, unavailable } from "@/server/http";

// `@/server/google/drive-storage` được import động: chế độ demo (503) không khởi tạo Prisma và
// không nạp `@/server/google/*`.

const DRIVE_NOT_CONNECTED_MESSAGE = "Bạn chưa kết nối Google Drive";
const DRIVE_ERROR_MESSAGE = "Không lấy được dung lượng Google Drive, vui lòng thử lại sau";

/**
 * GET /api/drive/storage (không nhận query)
 * → 200 { data: { storage: DriveStorage }, error: null } (số byte; `limit = null` khi không giới hạn)
 * | 401 | 403 error.code = "drive_not_connected"
 * | 502 Google lỗi / quá hạn | 503.
 */
export async function GET(): Promise<Response> {
  // Không bọc try/catch: connection() báo cho Next dừng prerender tại đây.
  await connection();
  try {
    const viewer = await getApiUserId();
    if (!viewer.ok) return viewer.status === 401 ? unauthorized() : unavailable();

    const { getDriveStorageQuota } = await import("@/server/google/drive-storage");
    const result = await getDriveStorageQuota(viewer.userId);

    switch (result.status) {
      case "ok":
        return ok<DriveStorageResponse>({ storage: result.storage });
      case "not_connected":
        return failWithCode(403, DRIVE_NOT_CONNECTED_MESSAGE, DRIVE_NOT_CONNECTED_CODE);
      case "error":
        return fail(502, DRIVE_ERROR_MESSAGE);
    }
  } catch (error) {
    return handleUnexpected(error, "GET /api/drive/storage");
  }
}
