import { DRIVE_NOT_CONNECTED_CODE } from "@/domain/drive-files";
import type { DriveFileItem } from "@/domain/types";
import { ApiRequestError } from "./drive-files-api";

/** Màn hình danh sách file Drive đang ở trạng thái nào. */
export type DriveFilesViewState = "demo" | "connect" | "loading" | "error" | "empty" | "list";

export interface DriveFilesStateInput {
  isDemo: boolean;
  driveConnected: boolean;
  status: "pending" | "error" | "success";
  error: unknown;
  /** Đã có dữ liệu (TanStack giữ `data` cũ khi refetch nền lỗi). */
  hasData: boolean;
  count: number;
}

function isNotConnectedError(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 403 && error.code === DRIVE_NOT_CONNECTED_CODE;
}

/**
 * Thứ tự ưu tiên: demo (dữ liệu store) → chưa kết nối Drive (theo phiên hoặc API báo 403
 * `drive_not_connected`) → lỗi khi chưa có dữ liệu → đang tải → rỗng → danh sách.
 * Refetch nền lỗi mà còn dữ liệu cũ thì giữ nguyên danh sách / rỗng.
 */
export function driveFilesViewState(input: DriveFilesStateInput): DriveFilesViewState {
  const { isDemo, driveConnected, status, error, hasData, count } = input;
  if (isDemo) return "demo";
  if (!driveConnected) return "connect";
  if (status === "error" && isNotConnectedError(error)) return "connect";
  if (status === "error" && !hasData) return "error";
  if (status === "pending") return "loading";
  return count > 0 ? "list" : "empty";
}

export interface DriveFilesErrorInfo {
  message: string;
  /** Thử lại có thể giúp (lỗi mạng / 5xx); 4xx thì không. */
  canRetry: boolean;
}

const SESSION_EXPIRED_MESSAGE = "Phiên đăng nhập đã hết hạn, hãy tải lại trang để đăng nhập lại.";
const CLIENT_ERROR_MESSAGE = "Yêu cầu không hợp lệ. Hãy tải lại trang.";
const TRANSIENT_MESSAGE = "Có thể Google đang bận hoặc mạng chập chờn. Hãy thử lại sau giây lát.";

/** Câu giải thích cho khối lỗi: 401 → hết phiên; 4xx khác → thông điệp API; còn lại → thử lại. */
export function driveFilesErrorInfo(error: unknown): DriveFilesErrorInfo {
  const clientError = error instanceof ApiRequestError && error.status >= 400 && error.status < 500;
  if (!clientError) return { message: TRANSIENT_MESSAGE, canRetry: true };
  if (error.status === 401) return { message: SESSION_EXPIRED_MESSAGE, canRetry: false };
  return { message: error.message.trim() || CLIENT_ERROR_MESSAGE, canRetry: false };
}

/** Phụ đề một file Drive: "dự án · không gian", bỏ phần trống. */
export function driveFileSubtitle({ projectName, spaceName }: Pick<DriveFileItem, "projectName" | "spaceName">): string {
  return [projectName, spaceName].filter(Boolean).join(" · ");
}
