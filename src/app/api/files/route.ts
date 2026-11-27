import { connection } from "next/server";
import { DRIVE_NOT_CONNECTED_CODE } from "@/domain/drive-files";
import { LIST_FILES_QUERY_KEYS, listFilesQuerySchema, queryToObject } from "@/domain/validation";
import { getApiUserId } from "@/server/auth/session";
import {
  duplicateQueryKeyMessage,
  fail,
  failWithCode,
  handleUnexpected,
  ok,
  unauthorized,
  unavailable,
  validationError,
} from "@/server/http";

// `@/server/drive-files` được import động: chế độ demo (503) không khởi tạo Prisma và không nạp
// `@/server/google/*`.

const SPACE_NOT_FOUND_MESSAGE = "Không tìm thấy không gian";
const PROJECT_NOT_FOUND_MESSAGE = "Không tìm thấy dự án";
const DRIVE_NOT_CONNECTED_MESSAGE = "Bạn chưa kết nối Google Drive";
const DRIVE_ERROR_MESSAGE = "Không tải được tài liệu từ Google Drive, vui lòng thử lại sau";

/**
 * GET /api/files?spaceId=&projectId=&kind=&limit=
 * → 200 { data: { files: DriveFileItem[] }, error: null } (mới sửa nhất trước; `limit` 1–100, mặc định 20)
 * | 400 query sai / key lặp / spaceId + projectId cùng lúc | 401
 * | 403 error.code = "drive_not_connected" | 404 không gian / dự án không thuộc user
 * | 502 Google lỗi / quá hạn | 503.
 */
export async function GET(request: Request): Promise<Response> {
  // Không bọc try/catch: connection() báo cho Next dừng prerender tại đây.
  await connection();
  try {
    const viewer = await getApiUserId();
    if (!viewer.ok) return viewer.status === 401 ? unauthorized() : unavailable();

    const query = queryToObject(new URL(request.url).searchParams, LIST_FILES_QUERY_KEYS);
    if (!query.ok) return fail(400, duplicateQueryKeyMessage(query.key));

    const parsed = listFilesQuerySchema.safeParse(query.value);
    if (!parsed.success) return validationError(parsed.error);

    const { listFiles } = await import("@/server/drive-files");
    const result = await listFiles(viewer.userId, parsed.data);
    if (result.ok) return ok({ files: result.files });

    switch (result.reason) {
      case "not_found":
        return fail(404, parsed.data.projectId ? PROJECT_NOT_FOUND_MESSAGE : SPACE_NOT_FOUND_MESSAGE);
      case "drive_not_connected":
        return failWithCode(403, DRIVE_NOT_CONNECTED_MESSAGE, DRIVE_NOT_CONNECTED_CODE);
      case "drive_error":
        return fail(502, DRIVE_ERROR_MESSAGE);
    }
  } catch (error) {
    return handleUnexpected(error, "GET /api/files");
  }
}
