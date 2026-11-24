"use client";

import { EventList } from "@/features/dashboard/today-calendar";
import { useUI } from "@/components/layout/ui-context";
import { TaskListRow } from "@/features/tasks/task-list-row";
import { formatLongToday } from "@/domain/dates";
import { SAMPLE_EVENTS } from "@/domain/seed";
import { APP_NAME } from "@/config/app";
import { useWorkspace } from "@/store/workspace-store";
import { card, cx } from "@/components/ui/styles";

export function CalendarView() {
  const { tasks, projects } = useWorkspace();
  const { now, today } = useUI();
  const dueToday = tasks.filter((t) => t.dueDate === today);

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-xs text-muted">{APP_NAME} / Lịch làm việc</p>
        <h1 className="text-[28px] font-semibold tracking-tight">Lịch làm việc</h1>
        <p className="mt-2 text-sm capitalize text-muted">{formatLongToday(now)}</p>
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <section className={cx(card, "p-5")}>
          <h2 className="mb-5 text-lg font-semibold">Sự kiện hôm nay</h2>
          <EventList events={SAMPLE_EVENTS} />
          <p className="mt-5 text-xs text-muted">Dữ liệu mẫu · Giai đoạn 4 lấy từ Google Calendar (calendar.readonly).</p>
        </section>
        <section className={cx(card, "p-5")}>
          <h2 className="mb-3 text-lg font-semibold">Hạn chót hôm nay</h2>
          <ul>
            {dueToday.map((task) => (
              <TaskListRow key={task.id} task={task} subtitle={projects.find((p) => p.id === task.projectId)?.name} />
            ))}
          </ul>
          {!dueToday.length && <p className="py-10 text-center text-sm text-muted">Không có công việc đến hạn hôm nay.</p>}
        </section>
      </div>
    </div>
  );
}
