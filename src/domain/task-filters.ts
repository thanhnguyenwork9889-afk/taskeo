import { addDays, isOverdue } from "@/domain/dates";
import type { ISODate, Priority, Project, Space, Task, TaskStatus } from "@/domain/types";

export type DueFilter = "" | "today" | "tomorrow" | "overdue" | "none";

export interface TaskFilters {
  spaceId: string;
  projectId: string;
  status: TaskStatus | "";
  priority: Priority | "";
  due: DueFilter;
  search: string;
}

export const EMPTY_FILTERS: TaskFilters = { spaceId: "", projectId: "", status: "", priority: "", due: "", search: "" };

export const DUE_FILTER_LABEL: Record<Exclude<DueFilter, "">, string> = {
  today: "Hôm nay",
  tomorrow: "Ngày mai",
  overdue: "Quá hạn",
  none: "Chưa có hạn",
};

function matchesDue(task: Task, due: DueFilter, today: ISODate): boolean {
  switch (due) {
    case "":
      return true;
    case "today":
      return task.dueDate === today;
    case "tomorrow":
      return task.dueDate === addDays(today, 1);
    case "overdue":
      return isOverdue(task, today);
    case "none":
      return task.dueDate === null;
  }
}

interface FilterContext {
  today: ISODate;
  /** Từ khoá ở ô tìm kiếm chung (Ctrl+K). */
  globalQuery: string;
  spaces: Space[];
  projects: Project[];
}

export function filterTasks(tasks: Task[], filters: TaskFilters, context: FilterContext): Task[] {
  const spaceName = new Map(context.spaces.map((s) => [s.id, s.name]));
  const projectName = new Map(context.projects.map((p) => [p.id, p.name]));
  const needles = [context.globalQuery, filters.search].map((q) => q.trim().toLocaleLowerCase("vi")).filter(Boolean);

  return tasks.filter((task) => {
    if (filters.spaceId && task.spaceId !== filters.spaceId) return false;
    if (filters.projectId && task.projectId !== filters.projectId) return false;
    if (filters.status && task.status !== filters.status) return false;
    if (filters.priority && task.priority !== filters.priority) return false;
    if (!matchesDue(task, filters.due, context.today)) return false;
    if (!needles.length) return true;
    const haystack = [task.title, projectName.get(task.projectId ?? ""), spaceName.get(task.spaceId ?? "")]
      .join(" ")
      .toLocaleLowerCase("vi");
    return needles.every((needle) => haystack.includes(needle));
  });
}
