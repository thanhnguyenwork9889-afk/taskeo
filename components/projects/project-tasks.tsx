"use client";

import { useState, type FormEvent } from "react";
import { ChevronDown, ListChecks, Plus } from "lucide-react";
import { matchesQuery, useUI } from "@/components/shell/ui-context";
import { TaskListRow } from "@/components/tasks/task-list-row";
import { StatusBadge } from "@/components/ui/badges";
import { STATUS_LABEL, TASK_STATUSES } from "@/lib/labels";
import type { Project, Task, TaskStatus } from "@/lib/types";
import { createTask } from "@/lib/workspace-actions";
import { updateWorkspace } from "@/lib/workspace-store";
import { card, control, cx } from "@/lib/ui";

export function ProjectTasks({ project, tasks }: { project: Project; tasks: Task[] }) {
  const { query } = useUI();
  const [collapsed, setCollapsed] = useState<TaskStatus[]>([]);
  const [drafts, setDrafts] = useState<Partial<Record<TaskStatus, string>>>({});

  const toggle = (status: TaskStatus) =>
    setCollapsed((current) => (current.includes(status) ? current.filter((s) => s !== status) : [...current, status]));

  const add = (event: FormEvent, status: TaskStatus) => {
    event.preventDefault();
    const title = drafts[status]?.trim();
    if (!title) return;
    updateWorkspace((s) => createTask(s, { title, spaceId: project.spaceId, projectId: project.id, status }, new Date()));
    setDrafts((current) => ({ ...current, [status]: "" }));
  };

  return (
    <section className={cx(card, "overflow-hidden")}>
      <div className="flex items-center justify-between border-b border-[#EDE9F3] px-5 py-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <ListChecks className="h-5 w-5 text-brand" aria-hidden />
          Công việc dự án
        </h2>
        <span className="text-xs text-muted">{tasks.length} công việc</span>
      </div>
      {TASK_STATUSES.map((status) => {
        const group = tasks.filter((t) => t.status === status && matchesQuery(query, t.title));
        const open = !collapsed.includes(status);
        return (
          <div key={status} className="border-b border-[#EDE9F3] last:border-0">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => toggle(status)}
              className={cx(control, "flex w-full items-center gap-2 rounded-none bg-brand-faint px-5 py-1.5 text-left")}
            >
              <ChevronDown className={cx("h-4 w-4 text-muted transition-transform", !open && "-rotate-90")} aria-hidden />
              <StatusBadge status={status} />
              <span className="text-xs text-muted">{group.length}</span>
            </button>
            {open && (
              <>
                <ul className="px-2">
                  {group.map((task) => (
                    <TaskListRow key={task.id} task={task} editableStatus />
                  ))}
                </ul>
                <form onSubmit={(event) => add(event, status)} className="flex items-center gap-2 px-6 py-1">
                  <Plus className="h-4 w-4 shrink-0 text-brand" aria-hidden />
                  <input
                    aria-label={`Thêm nhanh công việc ${STATUS_LABEL[status].toLowerCase()}`}
                    value={drafts[status] ?? ""}
                    onChange={(event) => setDrafts((current) => ({ ...current, [status]: event.target.value }))}
                    placeholder="Thêm công việc mới... nhấn Enter"
                    className="min-h-11 w-full min-w-0 rounded bg-transparent text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  />
                </form>
              </>
            )}
          </div>
        );
      })}
    </section>
  );
}
