"use client";

import { useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { useUI } from "@/components/layout/ui-context";
import { DueDate, PriorityBadge, StatusBadge } from "@/components/ui/badges";
import { TaskCheckbox } from "@/components/ui/task-checkbox";
import { TASK_STATUSES } from "@/domain/labels";
import type { Project, Space, Task, TaskStatus } from "@/domain/types";
import { toggleTaskDone } from "@/domain/workspace-actions";
import { updateWorkspace } from "@/store/workspace-store";
import { card, control, cx } from "@/components/ui/styles";

export interface TaskViewProps {
  tasks: Task[];
  spaces: Space[];
  projects: Project[];
  selectedId: string | null;
  onOpen: (id: string) => void;
  onCreate: () => void;
}

const HEADERS = ["Tên công việc", "Dự án", "Không gian", "Ưu tiên", "Hạn chót", "Trạng thái"];

export function TaskTable({ tasks, spaces, projects, selectedId, onOpen, onCreate }: TaskViewProps) {
  const { today } = useUI();
  const [collapsed, setCollapsed] = useState<TaskStatus[]>([]);
  const toggleGroup = (status: TaskStatus) =>
    setCollapsed((current) => (current.includes(status) ? current.filter((s) => s !== status) : [...current, status]));

  return (
    <div className={cx(card, "overflow-x-auto")}>
      <table className="w-full min-w-[940px] table-fixed border-collapse text-left text-sm">
        <thead className="border-b border-[#EAE7F1] bg-brand-faint text-muted">
          <tr>
            <th className="w-14 p-3">
              <span className="sr-only">Hoàn thành</span>
            </th>
            {HEADERS.map((header, index) => (
              <th key={header} className={cx("px-3 py-4 text-xs font-medium", index === 0 && "w-[28%]")}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        {TASK_STATUSES.map((status) => {
          const group = tasks.filter((t) => t.status === status);
          const open = !collapsed.includes(status);
          return (
            <tbody key={status}>
              <tr className="border-y border-[#EEEBF4] bg-brand-faint">
                <th colSpan={7} className="px-4">
                  <button type="button" onClick={() => toggleGroup(status)} aria-expanded={open} className={cx(control, "flex items-center gap-2")}>
                    <ChevronDown className={cx("h-4 w-4 transition-transform", !open && "-rotate-90")} aria-hidden />
                    <StatusBadge status={status} />
                    <span className="text-xs font-normal text-muted">{group.length}</span>
                  </button>
                </th>
              </tr>
              {open &&
                group.map((task) => (
                  <tr key={task.id} className={cx("border-b border-[#F0EDF5] hover:bg-[#FAF8FE]", selectedId === task.id && "bg-[#F4F0FC]")}>
                    <td className="px-2">
                      <TaskCheckbox title={task.title} done={task.status === "DONE"} onToggle={() => updateWorkspace((s) => toggleTaskDone(s, task.id, new Date()))} />
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => onOpen(task.id)}
                        className={cx(control, "w-full text-left font-medium", task.status === "DONE" && "text-muted line-through")}
                      >
                        {task.title}
                      </button>
                    </td>
                    <td className="truncate px-3 py-4 text-muted">{projects.find((p) => p.id === task.projectId)?.name ?? "—"}</td>
                    <td className="truncate px-3 py-4 text-muted">
                      <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full" style={{ background: spaces.find((s) => s.id === task.spaceId)?.color }} />
                      {spaces.find((s) => s.id === task.spaceId)?.name ?? "—"}
                    </td>
                    <td className="px-3">
                      <PriorityBadge priority={task.priority} />
                    </td>
                    <td className="px-3">
                      <DueDate task={task} today={today} />
                    </td>
                    <td className="px-3">
                      <StatusBadge status={task.status} />
                    </td>
                  </tr>
                ))}
              {open && !group.length && (
                <tr>
                  <td colSpan={7} className="px-8 py-4 text-sm text-muted">
                    Chưa có công việc trong nhóm này.
                  </td>
                </tr>
              )}
            </tbody>
          );
        })}
      </table>
      <button type="button" onClick={onCreate} className={cx(control, "flex items-center gap-2 px-6 py-3 text-sm text-brand-ink")}>
        <Plus className="h-4 w-4" aria-hidden />
        Thêm công việc mới
      </button>
    </div>
  );
}
