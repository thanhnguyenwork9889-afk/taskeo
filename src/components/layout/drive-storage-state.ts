import { DRIVE_NOT_CONNECTED_CODE } from "@/domain/drive-files";
import { formatBytes, formatStorageUsage, type StorageLevel } from "@/domain/drive-storage";
import type { DriveStorage } from "@/domain/types";
import { DriveStorageRequestError } from "./drive-storage-api";

/** Khối dung lượng Drive ở sidebar đang ở trạng thái nào. */
export type DriveStorageViewState = "hidden" | "loading" | "error" | "ready";

export interface DriveStorageStateInput {
  isDemo: boolean;
  driveConnected: boolean;
  status: "pending" | "error" | "success";
  error: unknown;
  /** Đã có dữ liệu (TanStack giữ `data` cũ khi refetch nền lỗi). */
  hasData: boolean;
}

function isNotConnectedError(error: unknown): boolean {
  return error instanceof DriveStorageRequestError && error.status === 403 && error.code === DRIVE_NOT_CONNECTED_CODE;
}

/**
 * Thứ tự ưu tiên: demo / chưa kết nối Drive (theo phiên hoặc API báo 403 `drive_not_connected`) → ẩn;
 * lỗi khi chưa có dữ liệu → error; đang tải → loading; còn lại (kể cả refetch nền lỗi còn dữ liệu cũ) → ready.
 */
export function driveStorageViewState(input: DriveStorageStateInput): DriveStorageViewState {
  const { isDemo, driveConnected, status, error, hasData } = input;
  if (isDemo || !driveConnected) return "hidden";
  if (status === "error" && isNotConnectedError(error)) return "hidden";
  if (status === "error" && !hasData) return "error";
  if (status === "pending") return "loading";
  return "ready";
}

const BAR_CLASS: Record<StorageLevel, string> = {
  normal: "bg-brand",
  warning: "bg-amber-500",
  danger: "bg-red-600",
};

/** Lớp màu phần đầy của thanh dung lượng theo mức cảnh báo. */
export function storageBarClass(level: StorageLevel): string {
  return BAR_CLASS[level];
}

/** Bề rộng tối thiểu (%) khi đã dùng > 0, để phần đầy vẫn thấy được. */
const MIN_VISIBLE_PERCENT = 2;

/** Bề rộng CSS phần đầy: kẹp 0–100, > 0 thì ít nhất 2%; âm / NaN → "0%". */
export function storageBarWidth(percent: number): string {
  if (!(percent > 0)) return "0%";
  return `${Math.min(100, Math.max(MIN_VISIBLE_PERCENT, percent))}%`;
}

/** Tooltip: "Trong Drive: X · Thùng rác: Y". */
export function storageTooltip(storage: DriveStorage): string {
  return `Trong Drive: ${formatBytes(storage.usageInDrive)} · Thùng rác: ${formatBytes(storage.usageInDriveTrash)}`;
}

export interface DriveStorageStatusInput {
  state: DriveStorageViewState;
  storage: DriveStorage | null;
  retrying: boolean;
}

/**
 * Chữ của vùng `role="status"`: đổi nội dung theo trạng thái để trình đọc màn hình đọc kết quả.
 * Đang thử lại sau lỗi → "Đang thử lại…", nên lần thất bại tiếp theo vẫn đổi chữ và được đọc lại.
 */
export function storageStatusText({ state, storage, retrying }: DriveStorageStatusInput): string {
  if (state === "loading") return "Đang tải dung lượng";
  if (state === "error") return retrying ? "Đang thử lại…" : "Không tải được dung lượng";
  if (state === "ready" && storage) return formatStorageUsage(storage);
  return "";
}
