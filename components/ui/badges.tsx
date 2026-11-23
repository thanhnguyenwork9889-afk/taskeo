import { ArrowUp, CalendarDays } from "lucide-react";
import { formatDayMonth, isOverdue } from "@/lib/dates";
import {
  OVERDUE_STYLE,
  PRIORITY_LABEL,
  PRIORITY_STYLE,
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_STYLE,
  STATUS_LABEL,
  STATUS_STYLE,
} from "@/lib/labels";
import type { Priority, ProjectStatus, Task, TaskStatus } from "@/lib/types";
import { cx } from "@/lib/ui";

const pill = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium";

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={cx(pill, STATUS_STYLE[status])}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function OverdueBadge() {
  return (
    <span className={cx(pill, OVERDUE_STYLE)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      Quá hạn
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={cx(pill, PRIORITY_STYLE[priority])}>
      <ArrowUp className="h-3 w-3" aria-hidden />
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <span className={cx(pill, PROJECT_STATUS_STYLE[status].badge)}>{PROJECT_STATUS_LABEL[status]}</span>;
}

export function DueDate({ task, today }: { task: Pick<Task, "status" | "dueDate">; today: string }) {
  const late = isOverdue(task, today);
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap text-xs", late ? "font-medium text-red-700" : "text-muted")}>
      <CalendarDays className="h-3.5 w-3.5" aria-hidden />
      {task.dueDate ? formatDayMonth(task.dueDate) : "Chưa có hạn"}
      {late && " · Quá hạn"}
    </span>
  );
}
