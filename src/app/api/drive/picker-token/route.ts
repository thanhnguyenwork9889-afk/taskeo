import { connection } from "next/server";
import { readPickerConfig } from "@/config/env";
import { DRIVE_NOT_CONNECTED_CODE, PICKER_NOT_CONFIGURED_CODE } from "@/domain/drive-files";
import type { PickerTokenResponse } from "@/domain/types";
import { getApiUserId } from "@/server/auth/session";
import { fail, failWithCode, handleUnexpected, ok, unauthorized, unavailable } from "@/server/http";

// `@/server/google/picker-token` được import động: chế độ demo (503) và thiếu cấu hình Picker
// không khởi tạo Prisma và không nạp `@/server/google/*`.
//
// Ngoại lệ duy nhất cho phép access token rời server (docs/02-google-cloud.md). Mọi phản hồi
// `Cache-Control: no-store`; không bao giờ log token.

const DRIVE_NOT_CONNECTED_MESSAGE = "Bạn chưa kết nối Google Drive";
const PICKER_NOT_CONFIGURED_MESSAGE = "Máy chủ chưa cấu hình Google Picker";
const TOKEN_ERROR_MESSAGE = "Không lấy được quyền truy cập Google Drive, vui lòng thử lại sau";

/** Gắn `Cache-Control: no-store` (token không được nằm trong cache trình duyệt / proxy). */
function noStore(response: Response): Response {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

async function handle(): Promise<Response> {
  try {
    const viewer = await getApiUserId();
    if (!viewer.ok) return viewer.status === 401 ? unauthorized() : unavailable();

    const config = readPickerConfig();
    if (config === null) {
      return failWithCode(503, PICKER_NOT_CONFIGURED_MESSAGE, PICKER_NOT_CONFIGURED_CODE);
    }

    const { getPickerAccessToken } = await import("@/server/google/picker-token");
    const result = await getPickerAccessToken(viewer.userId);

    switch (result.status) {
      case "ok":
        return ok<PickerTokenResponse>({
          accessToken: result.accessToken,
          expiresAt: result.expiresAt,
          developerKey: config.developerKey,
          appId: config.appId,
        });
      case "not_connected":
        return failWithCode(403, DRIVE_NOT_CONNECTED_MESSAGE, DRIVE_NOT_CONNECTED_CODE);
      case "error":
        return fail(502, TOKEN_ERROR_MESSAGE);
    }
  } catch (error) {
    return handleUnexpected(error, "GET /api/drive/picker-token");
  }
}

/**
 * GET /api/drive/picker-token (không nhận query)
 * → 200 { data: PickerTokenResponse, error: null }
 * | 401 | 403 error.code = "drive_not_connected"
 * | 502 lấy / refresh token lỗi hoặc quá hạn
 * | 503 demo | 503 error.code = "picker_not_configured" (thiếu biến Picker).
 * Mọi phản hồi có `Cache-Control: no-store`.
 */
export async function GET(): Promise<Response> {
  // Không bọc try/catch: connection() báo cho Next dừng prerender tại đây.
  await connection();
  return noStore(await handle());
}
