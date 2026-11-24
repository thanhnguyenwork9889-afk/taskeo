"use client";

import { useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LayoutGrid, List, Plus } from "lucide-react";
import { useUI } from "@/components/layout/ui-context";
import { EMPTY_FILTERS, filterTasks, type TaskFilters } from "@/domain/task-filters";
import { APP_NAME } from "@/config/app";
import { useWorkspace } from "@/store/workspace-store";
import { control, cx, primaryButton } from "@/components/ui/styles";
import { TaskDrawer } from "./task-drawer";
import { TaskFiltersBar } from "./task-filters-bar";
import { TaskKanban } from "./task-kanban";
import { TaskTable } from "./task-table";

type View = "list" | "kanban";
const VIEWS: { id: View; label: string; icon: typeof List }[] = [
  { id: "list", label: "Danh sách", icon: List },
  { id: "kanban", label: "Kanban", icon: LayoutGrid },
];

/** `?due=overdue` (từ thông báo) đặt bộ lọc ban đầu; đổi URL thì tạo lại bộ lọc. */
export function TasksView() {
  const due = useSearchParams().get("due") === "overdue" ? "overdue" : "";
  return <TasksBoard key={due} initialDue={due} />;
}

function TasksBoard({ initialDue }: { initialDue: TaskFilters["due"] }) {
  const { tasks, spaces, projects } = useWorkspace();
  const { query, today, openCreate } = useUI();
  const [view, setView] = useState<View>("list");
  const [filters, setFilters] = useState<TaskFilters>({ ...EMPTY_FILTERS, due: initialDue });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const trigger = useRef<HTMLElement | null>(null);

  const visible = filterTasks(tasks, filters, { today, globalQuery: query, spaces, projects });
  const selected = tasks.find((t) => t.id === selectedId);

  const open = (id: string) => {
    trigger.current = document.activeElement as HTMLElement | null;
    setSelectedId(id);
  };
  const close = () => {
    setSelectedId(null);
    trigger.current?.focus();
  };
  const create = () => openCreate({ kind: "task", spaceId: filters.spaceId || undefined, projectId: filters.projectId || undefined });
  const viewProps = { tasks: visible, spaces, projects, selectedId, onOpen: open, onCreate: create };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="mb-2 text-xs text-muted">{APP_NAME} / Công việc</p>
          <h1 className="text-[28px] font-semibold tracking-tight">Công việc</h1>
          <p className="mt-2 text-sm text-muted">Từ ý tưởng đến hoàn thành, từng việc một.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg border border-[#E6E3ED] bg-[#EEEDF4] p-1">
            {VIEWS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={view === item.id}
                onClick={() => setView(item.id)}
                className={cx(control, "flex items-center gap-2 px-3 text-sm", view === item.id ? "bg-white font-medium text-brand-ink shadow-sm" : "text-muted")}
              >
                <item.icon className="h-4 w-4" aria-hidden />
                {item.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={create} className={primaryButton}>
            <Plus className="h-4 w-4" aria-hidden />
            Công việc mới
          </button>
        </div>
      </div>

      <TaskFiltersBar filters={filters} onChange={setFilters} spaces={spaces} projects={projects} />

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          <strong className="font-semibold text-ink">{visible.length}</strong> / {tasks.length} công việc
          <span className="mx-2">·</span>
          {tasks.filter((t) => t.status === "DONE").length} đã hoàn thành
        </p>
        <button type="button" onClick={() => setFilters(EMPTY_FILTERS)} className={cx(control, "px-2 text-sm text-brand-ink")}>
          Xóa bộ lọc
        </button>
      </div>

      <div className={cx("grid items-start gap-5", selected && "xl:grid-cols-[minmax(0,1fr)_360px]")}>
        <div className="min-w-0">{view === "list" ? <TaskTable {...viewProps} /> : <TaskKanban {...viewProps} />}</div>
        {selected && <TaskDrawer task={selected} onClose={close} />}
      </div>
    </div>
  );
}
