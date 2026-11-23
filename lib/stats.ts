import { addDays, isOverdue, toISODate } from "@/lib/dates";
import type { Activity, ISODate, Task } from "@/lib/types";

const WEEKDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

export interface DailyCount {
  date: ISODate;
  label: string;
  count: number;
}

/**
 * Số công việc hoàn thành mỗi ngày trong `days` ngày gần nhất (tính cả hôm nay).
 * Mỗi công việc chỉ tính một lần mỗi ngày, và bỏ những việc đã bị mở lại (không còn DONE).
 * Bản ghi không gắn công việc (entityId null, dữ liệu lịch sử) được tính nguyên.
 */
export function completionsByDay(activities: Activity[], tasks: Task[], today: ISODate, days = 7): DailyCount[] {
  const doneIds = new Set(tasks.filter((t) => t.status === "DONE").map((t) => t.id));
  const seen = new Set<string>();
  const counts = new Map<ISODate, number>();
  for (const entry of activities) {
    if (entry.type !== "task_done") continue;
    if (entry.entityId && !doneIds.has(entry.entityId)) continue;
    const day = toISODate(new Date(entry.createdAt));
    if (entry.entityId) {
      const key = `${day}:${entry.entityId}`;
      if (seen.has(key)) continue;
      seen.add(key);
    }
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return Array.from({ length: days }, (_, index) => {
    const date = addDays(today, index - (days - 1));
    const [year, month, day] = date.split("-").map(Number);
    const label = date === today ? "Nay" : WEEKDAY[new Date(year, month - 1, day).getDay()];
    return { date, label, count: counts.get(date) ?? 0 };
  });
}

export interface TaskSummary {
  total: number;
  done: number;
  todo: number;
  inProgress: number;
  overdue: number;
  percent: number;
}

export function summarizeTasks(tasks: Task[], today: ISODate): TaskSummary {
  const done = tasks.filter((t) => t.status === "DONE").length;
  return {
    total: tasks.length,
    done,
    todo: tasks.filter((t) => t.status === "TODO").length,
    inProgress: tasks.filter((t) => t.status === "IN_PROGRESS").length,
    overdue: tasks.filter((t) => isOverdue(t, today)).length,
    percent: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
  };
}
