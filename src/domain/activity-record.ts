import { ACTIVITY_MESSAGE } from "@/domain/labels";
import type { Activity, ActivityType, TaskStatus } from "@/domain/types";
import { activityTypeSchema } from "@/domain/validation";

/** Bản ghi hoạt động từ DB (cấu trúc tương thích model `Activity` của Prisma, không phụ thuộc Prisma). */
export interface ActivityRecord {
  id: string;
  type: string;
  entityId: string | null;
  meta: unknown;
  createdAt: Date;
}

/** Một dòng activity cần ghi xuống DB (dạng `data` của `activity.createMany`). */
export interface NewActivityRow {
  userId: string;
  type: ActivityType;
  entityId: string;
  meta: { message: string };
  createdAt: Date;
}

/** Độ dài tối đa (theo code point) của câu mô tả trả về client. */
export const ACTIVITY_MESSAGE_MAX = 200;

/** Cắt chuỗi còn tối đa `max` code point, không cắt đôi cặp surrogate (emoji). */
function truncateCodePoints(text: string, max: number): string {
  const codePoints = Array.from(text);
  return codePoints.length > max ? codePoints.slice(0, max).join("") : text;
}

/**
 * Lấy `meta.message` nếu meta là object (không phải mảng) và message là chuỗi có nội dung,
 * cắt còn tối đa `ACTIVITY_MESSAGE_MAX` ký tự.
 */
function messageFromMeta(meta: unknown): string | null {
  if (typeof meta !== "object" || meta === null || Array.isArray(meta)) return null;
  const message: unknown = (meta as Record<string, unknown>).message;
  if (typeof message !== "string" || message.trim() === "") return null;
  return truncateCodePoints(message, ACTIVITY_MESSAGE_MAX);
}

/**
 * Đổi bản ghi DB → `Activity` phía client: type lạ → null, `meta.message` thiếu / sai kiểu / rỗng
 * → câu mặc định theo type, mốc thời gian dạng ISO, chỉ giữ 5 trường (không lộ meta / userId).
 */
export function activityFromRecord(record: ActivityRecord): Activity | null {
  const typeResult = activityTypeSchema.safeParse(record.type);
  if (!typeResult.success) return null;
  const type = typeResult.data;
  return {
    id: record.id,
    type,
    entityId: record.entityId,
    message: messageFromMeta(record.meta) ?? ACTIVITY_MESSAGE[type],
    createdAt: record.createdAt.toISOString(),
  };
}

/**
 * Các loại hoạt động cần ghi cho một thay đổi công việc.
 * `previous` null = tạo mới: `task_created` (+ `task_done` nếu tạo sẵn DONE).
 * Sửa: `task_done` khi chuyển từ khác DONE sang DONE, ngoài ra không ghi gì.
 */
export function taskActivityTypes(previous: TaskStatus | null, next: TaskStatus | undefined): ActivityType[] {
  const becomesDone = next === "DONE" && previous !== "DONE";
  if (previous === null) return becomesDone ? ["task_created", "task_done"] : ["task_created"];
  return becomesDone ? ["task_done"] : [];
}

/** Dựng các dòng activity (mỗi type một dòng, câu mô tả mặc định theo type) để ghi xuống DB. */
export function activityRows(
  userId: string,
  entityId: string,
  types: readonly ActivityType[],
  now: Date,
): NewActivityRow[] {
  return types.map((type) => ({ userId, type, entityId, meta: { message: ACTIVITY_MESSAGE[type] }, createdAt: now }));
}
