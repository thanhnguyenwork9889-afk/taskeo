import { ALREADY_ATTACHED_CODE, DRIVE_NOT_CONNECTED_CODE, INVALID_TARGET_CODE } from "@/domain/drive-files";
import type { AttachFileResponse } from "@/domain/types";
import { attachFileInputSchema } from "@/domain/validation";
import { getApiUserId } from "@/server/auth/session";
import {
  fail,
  failWithCode,
  handleUnexpected,
  ok,
  readJson,
  unauthorized,
  unavailable,
  validationError,
} from "@/server/http";

// `@/server/drive-files` được import động: chế độ demo (503) không khởi tạo Prisma và không nạp
// `@/server/google/*`.

const SPACE_NOT_FOUND_MESSAGE = "Không tìm thấy không gian";
const PROJECT_NOT_FOUND_MESSAGE = "Không tìm thấy dự án";
const DRIVE_NOT_CONNECTED_MESSAGE = "Bạn chưa kết nối Google Drive";
const INVALID_TARGET_MESSAGE =
  "File này không mở được bằng Taskeo hoặc không phải Google Docs / Sheets / Slides";
const ALREADY_ATTACHED_MESSAGE = "File này đã được gắn vào đây rồi";
const DRIVE_ATTACH_ERROR_MESSAGE =
  "Không gắn được file từ Google Drive. File có thể đã được gắn — hãy xem Tài liệu gần đây trước khi thử lại.";

/**
 * POST /api/files/attach { driveFileId, spaceId, projectId? }
 * → 201 { data: { file: DriveFileItem }, error: null } (lối tắt Drive trỏ tới file đích, đặt trong
 *   thư mục Drive của dự án nếu có `projectId`, ngược lại của không gian; thư mục còn thiếu được tạo bù)
 * | 400 JSON hỏng / body sai / khoá lạ | 401
 * | 403 error.code = "drive_not_connected"
 * | 404 không gian / dự án không thuộc user (hoặc dự án khác không gian), không có code
 * | 404 error.code = "invalid_target" (file đích không truy cập được, đã vào thùng rác, hoặc không
 *   phải Docs / Sheets / Slides)
 * | 409 error.code = "already_attached" | 502 Google lỗi / quá hạn / không tạo bù được thư mục | 503.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const viewer = await getApiUserId();
    if (!viewer.ok) return viewer.status === 401 ? unauthorized() : unavailable();

    const body = await readJson(request);
    if (!body.ok) return body.response;

    const parsed = attachFileInputSchema.safeParse(body.value);
    if (!parsed.success) return validationError(parsed.error);

    const { attachFile } = await import("@/server/drive-files");
    const result = await attachFile(viewer.userId, parsed.data);
    if (result.ok) {
      const data: AttachFileResponse = { file: result.file };
      return ok(data, 201);
    }

    switch (result.reason) {
      case "not_found":
        return fail(404, parsed.data.projectId ? PROJECT_NOT_FOUND_MESSAGE : SPACE_NOT_FOUND_MESSAGE);
      case "invalid_target":
        return failWithCode(404, INVALID_TARGET_MESSAGE, INVALID_TARGET_CODE);
      case "drive_not_connected":
        return failWithCode(403, DRIVE_NOT_CONNECTED_MESSAGE, DRIVE_NOT_CONNECTED_CODE);
      case "already_attached":
        return failWithCode(409, ALREADY_ATTACHED_MESSAGE, ALREADY_ATTACHED_CODE);
      case "drive_error":
        return fail(502, DRIVE_ATTACH_ERROR_MESSAGE);
    }
  } catch (error) {
    return handleUnexpected(error, "POST /api/files/attach");
  }
}
