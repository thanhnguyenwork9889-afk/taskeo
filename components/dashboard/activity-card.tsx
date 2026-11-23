"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useUI } from "@/components/shell/ui-context";
import { ProgressBar } from "@/components/ui/progress-bar";
import { completionsByDay, summarizeTasks } from "@/lib/stats";
import { useWorkspace } from "@/lib/workspace-store";
import { card, cx } from "@/lib/ui";

const BRAND = "#7960CE";
const AXIS = "#667085";

export function ActivityCard() {
  const { tasks, activities } = useWorkspace();
  const { today } = useUI();
  const summary = summarizeTasks(tasks, today);
  const history = completionsByDay(activities, tasks, today);

  const stats = [
    { label: "Hoàn thành", value: summary.done, style: "bg-emerald-50 text-emerald-700" },
    { label: "Chưa bắt đầu", value: summary.todo, style: "bg-slate-50 text-slate-600" },
    { label: "Đang tiến hành", value: summary.inProgress, style: "bg-blue-50 text-blue-700" },
    { label: "Quá hạn", value: summary.overdue, style: "bg-red-50 text-red-700" },
  ];

  return (
    <section className={cx(card, "p-5 md:col-span-2 xl:col-span-1")}>
      <h2 className="mb-5 text-lg font-semibold">Hoạt động của tôi</h2>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm">
          <strong className="text-xl font-semibold text-brand">{summary.percent}%</strong> hoàn thành
        </p>
        <span className="text-xs text-muted">
          {summary.done}/{summary.total} việc
        </span>
      </div>
      <div className="mb-5 mt-3">
        <ProgressBar label="Tỷ lệ hoàn thành" percent={summary.percent} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {stats.map((stat) => (
          <div key={stat.label} className={cx("rounded-lg px-3 py-2.5", stat.style)}>
            <span className="text-lg font-semibold">{stat.value}</span>
            <p className="mt-1 text-xs text-muted">{stat.label}</p>
          </div>
        ))}
      </div>
      <h3 className="mb-2 mt-5 text-sm font-medium">Hoàn thành 7 ngày qua</h3>
      <div className="h-36 w-full" role="img" aria-label={`Số công việc hoàn thành 7 ngày qua: ${history.map((d) => `${d.label} ${d.count}`).join(", ")}`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={history} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
            <CartesianGrid stroke="#EDEAF2" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: AXIS, fontSize: 12 }} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: AXIS, fontSize: 12 }} />
            <Tooltip formatter={(value) => [`${value} việc`, "Hoàn thành"]} />
            <Area type="monotone" dataKey="count" stroke={BRAND} strokeWidth={2.5} fill="#F2EDFB" dot={{ r: 3, fill: BRAND, stroke: "white", strokeWidth: 1.5 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
