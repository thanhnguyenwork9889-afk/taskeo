"use client";

import { useState, type DragEvent } from "react";
import { Plus } from "lucide-react";
import { useUI } from "@/components/layout/ui-context";
import { DueDate, PriorityBadge, StatusBadge } from "@/components/ui/badges";
import { STATUS_LABEL, TASK_STATUSES } from "@/domain/labels";
import type { TaskStatus } from "@/domain/types";
import { setTaskStatus } from "@/domain/workspace-actions";
import { updateWorkspace } from "@/store/workspace-store";
import { card, control, cx } from "@/components/ui/styles";
import type { TaskViewProps } from "./task-table";

const DRAG_TYPE = "text/plain";

export function TaskKanban({ tasks, projects, selectedId, onOpen, onCreate }: TaskViewProps) {
  const { today } = useUI();
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<TaskStatus | null>(null);

  const drop = (event: DragEvent, status: TaskStatus) => {
    event.preventDefault();
    const id = event.dataTransfer.getData(DRAG_TYPE);
    if (tasks.some((t) => t.id === id)) updateWorkspace((s) => setTaskStatus(s, id, status, new Date()));
    setDragging(null);
    setDropTarget(null);
  };

  return (
    <>
      <p className="mb-3 text-xs text-muted">Kéo thả để chuyển trạng thái, hoặc mở thẻ để đổi trạng thái bằng bàn phím.</p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {TASK_STATUSES.map((status) => {
          const column = tasks.filter((t) => t.status === status);
          return (
            <section
              key={status}
              aria-label={`Cột ${STATUS_LABEL[status]}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDropTarget(status);
              }}
              onDragLeave={() => setDropTarget(null)}
              onDrop={(event) => drop(event, status)}
              className={cx(
                "min-h-72 min-w-0 rounded-xl border p-3",
                dropTarget === status ? "border-brand bg-[#F0E9FC]" : "border-[#E9E5F0] bg-[#F0EFF5]",
              )}
            >
              <h2 className="mb-4 flex items-center justify-between gap-2">
                <StatusBadge status={status} />
                <span className="text-xs text-muted">{column.length}</span>
              </h2>
              <div className="space-y-3">
                {column.map((task) => (
                  <article
                    key={task.id}
                    draggable
                    onDragStart={(event) => {
                      setDragging(task.id);
                      event.dataTransfer.setData(DRAG_TYPE, task.id);
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setDropTarget(null);
                    }}
                    className={cx(card, "cursor-grab p-3", (dragging === task.id || selectedId === task.id) && "ring-2 ring-brand")}
                  >
                    <PriorityBadge priority={task.priority} />
                    <button
                      type="button"
                      onClick={() => onOpen(task.id)}
                      className={cx(control, "my-2 w-full text-left text-sm font-medium leading-6", task.status === "DONE" && "text-muted line-through")}
                    >
                      {task.title}
                    </button>
                    <p className="mb-3 truncate text-xs text-muted">{projects.find((p) => p.id === task.projectId)?.name ?? "Không gắn dự án"}</p>
                    <div className="border-t border-[#F0EDF5] pt-3">
                      <DueDate task={task} today={today} />
                    </div>
                  </article>
                ))}
              </div>
              {!column.length && <p className="rounded-lg border border-dashed border-[#D7CFE6] p-5 text-center text-sm text-muted">Thả công việc vào đây</p>}
              <button type="button" onClick={onCreate} className={cx(control, "mt-3 flex w-full items-center gap-2 px-2 text-sm text-muted")}>
                <Plus className="h-4 w-4" aria-hidden />
                Thêm công việc
              </button>
            </section>
          );
        })}
      </div>
    </>
  );
}
