"use client";

import { useState, type FormEvent } from "react";
import { CalendarDays, Plus } from "lucide-react";
import { matchesQuery, useUI } from "@/components/shell/ui-context";
import { OverdueBadge, StatusBadge } from "@/components/ui/badges";
import { TaskCheckbox } from "@/components/ui/task-checkbox";
import { isOverdue, relativeDayLabel } from "@/lib/dates";
import type { Task, TaskStatus } from "@/lib/types";
import { createTask, toggleTaskDone } from "@/lib/workspace-actions";
import { updateWorkspace, useWorkspace } from "@/lib/workspace-store";
import { card, control, cx } from "@/lib/ui";

const TABS: { label: string; status: TaskStatus | null }[] = [
  { label: "Tất cả", status: null },
  { label: "Chưa bắt đầu", status: "TODO" },
  { label: "Đang làm", status: "IN_PROGRESS" },
  { label: "Xong", status: "DONE" },
];

const MAX_VISIBLE = 8;

/** Việc chưa xong lên trước, rồi theo hạn chót gần nhất. */
function byUrgency(a: Task, b: Task): number {
  if ((a.status === "DONE") !== (b.status === "DONE")) return a.status === "DONE" ? 1 : -1;
  return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
}

export function MyTasksCard() {
  const { tasks, spaces, projects } = useWorkspace();
  const { query, today } = useUI();
  const [tab, setTab] = useState<TaskStatus | null>(null);
  const [quickTitle, setQuickTitle] = useState("");

  const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name ?? "Không gắn dự án";
  const visible = tasks
    .filter((t) => (!tab || t.status === tab) && matchesQuery(query, t.title, projectName(t.projectId)))
    .sort(byUrgency)
    .slice(0, MAX_VISIBLE);

  const addQuick = (event: FormEvent) => {
    event.preventDefault();
    if (!quickTitle.trim()) return;
    updateWorkspace((s) => createTask(s, { title: quickTitle, spaceId: spaces[0]?.id ?? null, dueDate: today }, new Date()));
    setQuickTitle("");
    setTab(null);
  };

  return (
    <section className={cx(card, "flex flex-col")}>
      <div className="px-5 pt-5">
        <h2 className="mb-3 text-lg font-semibold">Công việc của tôi</h2>
        <div role="tablist" aria-label="Trạng thái công việc" className="flex gap-3 overflow-x-auto">
          {TABS.map((item) => (
            <button
              key={item.label}
              type="button"
              role="tab"
              aria-selected={tab === item.status}
              onClick={() => setTab(item.status)}
              className={cx(
                control,
                "shrink-0 rounded-none border-b-2 text-xs",
                tab === item.status ? "border-brand font-semibold text-brand-ink" : "border-transparent text-muted",
              )}
            >
              {item.label}
              <span className="ml-1 rounded bg-[#F3F1F8] px-1 py-0.5">{tasks.filter((t) => !item.status || t.status === item.status).length}</span>
            </button>
          ))}
        </div>
      </div>
      <ul className="flex-1 border-t border-line-soft">
        {visible.map((task) => (
          <li key={task.id} className="flex items-start gap-1 border-b border-line-soft px-3 py-2.5">
            <TaskCheckbox title={task.title} done={task.status === "DONE"} onToggle={() => updateWorkspace((s) => toggleTaskDone(s, task.id, new Date()))} />
            <div className="min-w-0 flex-1 py-1">
              <p className={cx("text-sm leading-5", task.status === "DONE" ? "text-muted line-through" : "font-medium")}>{task.title}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                {task.dueDate && (
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" aria-hidden />
                    {relativeDayLabel(task.dueDate, today)}
                  </span>
                )}
                <span>· {projectName(task.projectId)}</span>
                {isOverdue(task, today) ? <OverdueBadge /> : <StatusBadge status={task.status} />}
              </div>
            </div>
          </li>
        ))}
        {!visible.length && <li className="p-8 text-center text-sm text-muted">Không có công việc phù hợp.</li>}
      </ul>
      <form onSubmit={addQuick} className="flex items-center gap-2 px-5 py-2">
        <Plus className="h-4 w-4 shrink-0 text-brand" aria-hidden />
        <input
          aria-label="Thêm nhanh công việc mới, nhấn Enter để lưu"
          value={quickTitle}
          onChange={(event) => setQuickTitle(event.target.value)}
          placeholder="Thêm nhanh công việc mới..."
          className="min-h-11 w-full min-w-0 rounded text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand"
        />
      </form>
    </section>
  );
}
