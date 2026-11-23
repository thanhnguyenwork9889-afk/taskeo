"use client";

import { useUI } from "@/components/layout/ui-context";
import { DueDate, PriorityBadge, StatusBadge } from "@/components/ui/badges";
import { TaskCheckbox } from "@/components/ui/task-checkbox";
import { STATUS_LABEL, TASK_STATUSES } from "@/domain/labels";
import type { Task, TaskStatus } from "@/domain/types";
import { setTaskStatus, toggleTaskDone } from "@/domain/workspace-actions";
import { updateWorkspace } from "@/store/workspace-store";
import { control, cx } from "@/components/ui/styles";

interface TaskListRowProps {
  task: Task;
  subtitle?: string;
  /** Hiện ô chọn trạng thái thay cho badge (trang dự án). */
  editableStatus?: boolean;
}

export function TaskListRow({ task, subtitle, editableStatus = false }: TaskListRowProps) {
  const { today } = useUI();
  const done = task.status === "DONE";
  return (
    <li className="flex items-center gap-2 border-t border-[#EFECF4] px-1 py-2">
      <TaskCheckbox title={task.title} done={done} onToggle={() => updateWorkspace((s) => toggleTaskDone(s, task.id, new Date()))} />
      <div className="min-w-0 flex-1 py-1">
        <p className={cx("text-sm leading-6", done ? "text-muted line-through" : "font-medium")}>{task.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          {subtitle && <span className="text-xs text-muted">{subtitle}</span>}
          <PriorityBadge priority={task.priority} />
          <DueDate task={task} today={today} />
        </div>
      </div>
      {editableStatus ? (
        <select
          aria-label={`Trạng thái ${task.title}`}
          value={task.status}
          onChange={(event) => updateWorkspace((s) => setTaskStatus(s, task.id, event.target.value as TaskStatus, new Date()))}
          className={cx(control, "hidden max-w-36 bg-transparent px-2 text-xs text-muted md:block")}
        >
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      ) : (
        <span className="hidden md:block">
          <StatusBadge status={task.status} />
        </span>
      )}
    </li>
  );
}
