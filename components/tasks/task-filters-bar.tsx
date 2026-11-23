"use client";

import { Search } from "lucide-react";
import { PRIORITIES, PRIORITY_LABEL, STATUS_LABEL, TASK_STATUSES } from "@/lib/labels";
import { DUE_FILTER_LABEL, type TaskFilters } from "@/lib/task-filters";
import type { Project, Space } from "@/lib/types";
import { card, cx, field } from "@/lib/ui";

interface TaskFiltersBarProps {
  filters: TaskFilters;
  onChange: (next: TaskFilters) => void;
  spaces: Space[];
  projects: Project[];
}

const selectClass = cx(field, "w-auto max-w-full flex-1 md:max-w-44");

export function TaskFiltersBar({ filters, onChange, spaces, projects }: TaskFiltersBarProps) {
  const set = <K extends keyof TaskFilters>(key: K, value: TaskFilters[K]) => onChange({ ...filters, [key]: value });
  const spaceProjects = projects.filter((p) => !filters.spaceId || p.spaceId === filters.spaceId);

  return (
    <section aria-label="Bộ lọc công việc" className={cx(card, "flex flex-wrap items-center gap-3 p-4")}>
      <select
        aria-label="Lọc theo không gian"
        value={filters.spaceId}
        onChange={(event) => onChange({ ...filters, spaceId: event.target.value, projectId: "" })}
        className={selectClass}
      >
        <option value="">Không gian</option>
        {spaces.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <select aria-label="Lọc theo dự án" value={filters.projectId} onChange={(event) => set("projectId", event.target.value)} className={selectClass}>
        <option value="">Dự án</option>
        {spaceProjects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Lọc theo trạng thái"
        value={filters.status}
        onChange={(event) => set("status", event.target.value as TaskFilters["status"])}
        className={selectClass}
      >
        <option value="">Trạng thái</option>
        {TASK_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      <select
        aria-label="Lọc theo ưu tiên"
        value={filters.priority}
        onChange={(event) => set("priority", event.target.value as TaskFilters["priority"])}
        className={selectClass}
      >
        <option value="">Ưu tiên</option>
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {PRIORITY_LABEL[p]}
          </option>
        ))}
      </select>
      <select aria-label="Lọc theo hạn chót" value={filters.due} onChange={(event) => set("due", event.target.value as TaskFilters["due"])} className={selectClass}>
        <option value="">Hạn chót</option>
        {Object.entries(DUE_FILTER_LABEL).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <div className="flex min-w-48 flex-1 items-center gap-2 rounded-lg border border-[#E6E3ED] px-3 text-muted">
        <Search className="h-4 w-4 shrink-0" aria-hidden />
        <input
          type="search"
          aria-label="Tìm công việc"
          value={filters.search}
          onChange={(event) => set("search", event.target.value)}
          placeholder="Tìm công việc..."
          className="min-h-11 w-full min-w-0 text-sm text-ink outline-none"
        />
      </div>
    </section>
  );
}
