import type { TaskStatus } from "@/domain/types";

/**
 * Tính `completedAt` mới khi trạng thái công việc (có thể) đổi.
 * - `nextStatus` không có hoặc bằng trạng thái hiện tại → giữ giá trị cũ (kể cả DONE → DONE).
 * - Chuyển sang DONE → `now`; chuyển khỏi DONE → `null`; giữa hai trạng thái khác DONE → giữ.
 * Generic để server dùng `Date`, store demo dùng chuỗi ISO.
 * Khi tạo mới: `completedAtFor("TODO", null, status, now)`.
 */
export function completedAtFor<T>(
  currentStatus: TaskStatus,
  currentCompletedAt: T | null,
  nextStatus: TaskStatus | undefined,
  now: T,
): T | null {
  if (nextStatus === undefined || nextStatus === currentStatus) return currentCompletedAt;
  if (nextStatus === "DONE") return now;
  if (currentStatus === "DONE") return null;
  return currentCompletedAt;
}
