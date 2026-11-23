"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useUI } from "@/components/layout/ui-context";
import { DocIcon } from "@/components/ui/doc-icon";
import { formatDateTime } from "@/domain/dates";
import { PRIORITIES, PRIORITY_LABEL, STATUS_LABEL, TASK_STATUSES } from "@/domain/labels";
import type { Priority, Task, TaskStatus } from "@/domain/types";
import { setTaskStatus, updateTask, type TaskChanges } from "@/domain/workspace-actions";
import { updateWorkspace, useWorkspace } from "@/store/workspace-store";
import { card, control, cx, field } from "@/components/ui/styles";

interface TaskDrawerProps {
  task: Task;
  onClose: () => void;
}

export function TaskDrawer({ task, onClose }: TaskDrawerProps) {
  const { projects, spaces, files, activities } = useWorkspace();
  const { notify } = useUI();
  const panel = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Có hộp thoại đang mở thì Esc thuộc về hộp thoại đó.
      if (document.querySelector('[aria-modal="true"]')) return;
      // Blur trước để onBlur của ô đang sửa kịp lưu thay đổi.
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [task.id]);

  const save = (changes: TaskChanges, message: string) => updateWorkspace((s) => updateTask(s, task.id, changes, message, new Date()));
  const linked = files.filter((f) => task.linkedFileIds.includes(f.id));
  const linkable = files.filter((f) => f.spaceId === task.spaceId && !task.linkedFileIds.includes(f.id));
  const log = activities.filter((a) => a.entityId === task.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <aside ref={panel} aria-label="Chi tiết công việc" className={cx(card, "sticky top-5 max-h-[85vh] overflow-y-auto border-[#DDD5ED] shadow-sm")}>
      <div className="flex items-center justify-between border-b border-[#EEEBF4] px-5 py-2">
        <span className="text-sm font-medium text-muted">Chi tiết công việc</span>
        <button type="button" aria-label="Đóng chi tiết" onClick={onClose} className={cx(control, "flex w-11 items-center justify-center")}>
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="space-y-5 p-5">
        <label className="block text-xs font-medium text-muted">
          Tên công việc
          <input
            key={`title-${task.id}`}
            defaultValue={task.title}
            maxLength={200}
            onBlur={(event) => {
              const value = event.target.value.trim();
              if (value && value !== task.title) save({ title: value }, "Cập nhật tên công việc");
              else event.target.value = task.title;
            }}
            className={cx(field, "mt-2 font-semibold text-ink")}
          />
        </label>
        <label className="block text-sm font-medium">
          Mô tả
          <textarea
            key={`description-${task.id}`}
            defaultValue={task.description}
            onBlur={(event) => {
              if (event.target.value !== task.description) save({ description: event.target.value }, "Cập nhật mô tả");
            }}
            placeholder="Thêm ghi chú, ý tưởng hoặc yêu cầu..."
            className={cx(field, "mt-2 min-h-24 py-3 font-normal leading-6")}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 text-sm text-muted">
            Dự án
            <select
              value={task.projectId ?? ""}
              onChange={(event) => {
                const project = projects.find((p) => p.id === event.target.value);
                save({ projectId: project?.id ?? null }, project ? `Chuyển đến dự án ${project.name}` : "Bỏ gắn dự án");
              }}
              className={cx(field, "mt-2")}
            >
              <option value="">Không gắn dự án</option>
              {spaces.map((space) => (
                <optgroup key={space.id} label={space.name}>
                  {projects
                    .filter((p) => p.spaceId === space.id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="text-sm text-muted">
            Trạng thái
            <select
              value={task.status}
              onChange={(event) => updateWorkspace((s) => setTaskStatus(s, task.id, event.target.value as TaskStatus, new Date()))}
              className={cx(field, "mt-2")}
            >
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-muted">
            Ưu tiên
            <select
              value={task.priority}
              onChange={(event) => {
                const priority = event.target.value as Priority;
                save({ priority }, `Đặt ưu tiên: ${PRIORITY_LABEL[priority]}`);
              }}
              className={cx(field, "mt-2")}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2 text-sm text-muted">
            Hạn chót
            <input
              type="date"
              value={task.dueDate ?? ""}
              onChange={(event) => save({ dueDate: event.target.value || null }, "Cập nhật hạn chót")}
              className={cx(field, "mt-2")}
            />
          </label>
        </div>

        <div className="rounded-lg bg-[#F6F3FB] p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">Đẩy hạn chót lên Google Calendar</span>
            <button
              type="button"
              role="switch"
              aria-checked={task.addToCalendar}
              aria-label="Đẩy hạn chót lên Google Calendar"
              onClick={() => save({ addToCalendar: !task.addToCalendar }, task.addToCalendar ? "Tắt đồng bộ lịch" : "Bật đồng bộ lịch")}
              className={cx(control, "flex w-12 shrink-0 items-center")}
            >
              <span className={cx("flex h-6 w-11 items-center rounded-full px-1", task.addToCalendar ? "bg-brand" : "bg-slate-300")}>
                <span className={cx("h-4 w-4 rounded-full bg-white transition-transform", task.addToCalendar && "translate-x-5")} />
              </span>
            </button>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted">Giai đoạn 4 mới tạo sự kiện thật trên Google Calendar.</p>
        </div>

        <section>
          <h3 className="mb-3 text-sm font-semibold">
            Tài liệu liên kết <span className="ml-1 text-xs font-normal text-muted">{linked.length}</span>
          </h3>
          {linked.map((file) => (
            <div key={file.id} className="flex items-center gap-2 border-b border-[#EEEBF4]">
              <DocIcon kind={file.kind} size="sm" />
              <button type="button" onClick={() => notify("Giai đoạn 3 sẽ mở file thật trên Google Drive.")} className={cx(control, "min-w-0 flex-1 truncate text-left text-sm")}>
                {file.name}
              </button>
              <button
                type="button"
                aria-label={`Bỏ liên kết ${file.name}`}
                onClick={() => save({ linkedFileIds: task.linkedFileIds.filter((id) => id !== file.id) }, `Bỏ liên kết ${file.name}`)}
                className={cx(control, "flex w-11 items-center justify-center")}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ))}
          {linkable.length > 0 && (
            <select
              aria-label="Liên kết tài liệu trong không gian"
              value=""
              onChange={(event) => {
                const file = files.find((f) => f.id === event.target.value);
                if (file) save({ linkedFileIds: [...task.linkedFileIds, file.id] }, `Liên kết ${file.name}`);
              }}
              className={cx(field, "mt-2")}
            >
              <option value="">+ Liên kết tài liệu</option>
              {linkable.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          )}
        </section>

        <section>
          <h3 className="mb-4 text-sm font-semibold">Nhật ký hoạt động</h3>
          {log.length ? (
            <ol className="space-y-4">
              {log.map((entry) => (
                <li key={entry.id} className="flex gap-3">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#A38BCF]" />
                  <div>
                    <p className="text-sm leading-5">{entry.message}</p>
                    <p className="mt-1 text-xs text-muted">Bạn · {formatDateTime(entry.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm leading-6 text-muted">Chưa có thay đổi. Hoạt động chỉnh sửa sẽ xuất hiện tại đây.</p>
          )}
        </section>
        <p className="border-t border-[#EEEBF4] pt-4 text-xs text-muted">Tự động lưu · Nhấn Esc để đóng</p>
      </div>
    </aside>
  );
}
