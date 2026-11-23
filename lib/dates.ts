import type { ISODate, Task } from "@/lib/types";

const pad = (value: number) => String(value).padStart(2, "0");

/** Ngày theo giờ địa phương dạng YYYY-MM-DD. */
export function toISODate(date: Date): ISODate {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(date: ISODate, days: number): ISODate {
  const [year, month, day] = date.split("-").map(Number);
  return toISODate(new Date(year, month - 1, day + days));
}

/** Đổi YYYY-MM-DD thành Date lúc 12:00 để tránh lệch ngày do múi giờ. */
export function parseISODate(date: ISODate): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

/** Quá hạn = có hạn chót, hạn chót trước hôm nay và chưa xong. */
export function isOverdue(task: Pick<Task, "status" | "dueDate">, today: ISODate): boolean {
  return task.status !== "DONE" && task.dueDate !== null && task.dueDate < today;
}

export function formatDayMonth(date: ISODate): string {
  return parseISODate(date).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

export function formatFullDate(date: ISODate): string {
  return parseISODate(date).toLocaleDateString("vi-VN");
}

export function formatLongToday(now: Date): string {
  return now.toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN");
}

/** "Hôm nay", "Ngày mai", "Hôm qua" hoặc dd/mm. */
export function relativeDayLabel(date: ISODate, today: ISODate): string {
  if (date === today) return "Hôm nay";
  if (date === addDays(today, 1)) return "Ngày mai";
  if (date === addDays(today, -1)) return "Hôm qua";
  return formatDayMonth(date);
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function timeAgo(iso: string, now: Date): string {
  const diff = Math.max(0, now.getTime() - new Date(iso).getTime());
  if (diff < HOUR) return `${Math.max(1, Math.round(diff / MINUTE))} phút trước`;
  if (diff < DAY) return `${Math.round(diff / HOUR)} giờ trước`;
  return `${Math.round(diff / DAY)} ngày trước`;
}

export function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 11) return "Chào buổi sáng";
  if (hour < 14) return "Chào buổi trưa";
  if (hour < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
}
