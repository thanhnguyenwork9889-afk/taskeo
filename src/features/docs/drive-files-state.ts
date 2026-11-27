import { DRIVE_NOT_CONNECTED_CODE } from "@/domain/drive-files";
import { ApiRequestError } from "./drive-files-api";

/** Màn hình danh sách file Drive đang ở trạng thái nào. */
export type DriveFilesViewState = "demo" | "connect" | "loading" | "error" | "empty" | "list";

export interface DriveFilesStateInput {
  isDemo: boolean;
  driveConnected: boolean;
  status: "pending" | "error" | "success";
  error: unknown;
  count: number;
}

function isNotConnectedError(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 403 && error.code === DRIVE_NOT_CONNECTED_CODE;
}

/**
 * Thứ tự ưu tiên: demo (dữ liệu store) → chưa kết nối Drive (theo phiên hoặc API báo 403
 * `drive_not_connected`) → lỗi → đang tải → rỗng → danh sách.
 */
export function driveFilesViewState({ isDemo, driveConnected, status, error, count }: DriveFilesStateInput): DriveFilesViewState {
  if (isDemo) return "demo";
  if (!driveConnected) return "connect";
  if (status === "error") return isNotConnectedError(error) ? "connect" : "error";
  if (status === "pending") return "loading";
  return count > 0 ? "list" : "empty";
}
