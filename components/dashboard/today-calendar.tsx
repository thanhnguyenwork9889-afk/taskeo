"use client";

import { CalendarDays } from "lucide-react";
import { useUI } from "@/components/shell/ui-context";
import { SectionHeading } from "@/components/ui/section-heading";
import { formatLongToday } from "@/lib/dates";
import { SAMPLE_EVENTS } from "@/lib/seed";
import type { CalendarEvent } from "@/lib/types";
import { card, cx } from "@/lib/ui";

// Giai đoạn 4: thay SAMPLE_EVENTS bằng dữ liệu từ /api/calendar/today.

export function EventList({ events }: { events: CalendarEvent[] }) {
  if (!events.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
        <span className="mb-4 rounded-full bg-[#F3EFFB] p-5 text-brand">
          <CalendarDays className="h-8 w-8" aria-hidden />
        </span>
        <h3 className="text-lg font-semibold">Lịch trống hôm nay</h3>
        <p className="mt-2 max-w-52 text-sm leading-6 text-muted">Một chút thời gian dành cho ý tưởng mới của bạn.</p>
      </div>
    );
  }
  return (
    <ul className="space-y-5">
      {events.map((event) => (
        <li key={event.id} className="flex gap-3">
          <div className="w-11 shrink-0 pt-2 text-sm font-medium">
            {event.start}
            <span className="mt-1 block text-xs font-normal text-muted">{event.end}</span>
          </div>
          <div
            className="min-w-0 flex-1 rounded-r-lg border-l-[3px] px-3 py-3"
            style={{ borderColor: event.color, background: `color-mix(in srgb, ${event.color} 7%, white)` }}
          >
            <h3 className="text-sm font-medium leading-5">{event.title}</h3>
            <p className="mt-1.5 text-xs text-muted">{event.subtitle}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function TodayCalendar() {
  const { now } = useUI();
  return (
    <section className={cx(card, "flex flex-col p-5")}>
      <SectionHeading title="Lịch làm việc hôm nay" action="Xem lịch" href="/calendar" />
      <p className="-mt-3 mb-6 text-xs capitalize text-muted">{formatLongToday(now)}</p>
      <EventList events={SAMPLE_EVENTS} />
      <p className="mt-auto pt-5 text-xs text-muted">Dữ liệu mẫu · Chưa kết nối Google Calendar</p>
    </section>
  );
}
