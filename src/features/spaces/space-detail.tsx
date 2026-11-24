"use client";

import { useState } from "react";
import { notFound, useParams } from "next/navigation";
import { Clock, ExternalLink, FileText, FolderOpen, ListChecks, Plus, type LucideIcon } from "lucide-react";
import { matchesQuery, useUI } from "@/components/layout/ui-context";
import { FileRow } from "@/features/docs/file-row";
import { TaskListRow } from "@/features/tasks/task-list-row";
import { SectionHeading } from "@/components/ui/section-heading";
import { isOverdue } from "@/domain/dates";
import { APP_NAME } from "@/config/app";
import { useWorkspace } from "@/store/workspace-store";
import { card, control, cx, primaryButton, secondaryButton } from "@/components/ui/styles";
import { ProjectCard } from "./project-card";

type Tab = "projects" | "tasks" | "docs";
const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "projects", label: "Dự án", icon: FolderOpen },
  { id: "tasks", label: "Công việc", icon: ListChecks },
  { id: "docs", label: "Tài liệu", icon: FileText },
];

function StatCard({ label, value, note, icon: Icon, style }: { label: string; value: number; note: string; icon: LucideIcon; style: string }) {
  return (
    <div className={cx(card, "p-5")}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted">{label}</p>
        <span className={cx("flex h-9 w-9 items-center justify-center rounded-lg", style)}>
          <Icon className="h-[18px] w-[18px]" aria-hidden />
        </span>
      </div>
      <p className="mt-3 text-[28px] font-semibold">{String(value).padStart(2, "0")}</p>
      <p className="mt-1 text-xs text-muted">{note}</p>
    </div>
  );
}

export function SpaceDetail() {
  const { id: spaceId } = useParams<{ id: string }>();
  const { spaces, projects, tasks, files } = useWorkspace();
  const { query, today, openCreate } = useUI();
  const [tab, setTab] = useState<Tab>("projects");

  const space = spaces.find((s) => s.id === spaceId);
  if (!space) notFound();

  const spaceProjects = projects.filter((p) => p.spaceId === space.id);
  const spaceTasks = tasks.filter((t) => t.spaceId === space.id);
  const spaceFiles = files.filter((f) => f.spaceId === space.id);
  const projectName = (id: string | null) => spaceProjects.find((p) => p.id === id)?.name;
  const counts: Record<Tab, number> = { projects: spaceProjects.length, tasks: spaceTasks.length, docs: spaceFiles.length };

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted">
        {APP_NAME} / Không gian / <span className="text-brand-ink">{space.name}</span>
      </p>
      <header className={cx(card, "relative overflow-hidden p-6 md:p-8")}>
        <div className="absolute inset-x-0 top-0 h-1" style={{ background: space.color }} />
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl" style={{ background: space.tint, color: space.color }}>
              <FolderOpen className="h-8 w-8" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="mb-1.5 text-xs font-medium tracking-widest text-muted">KHÔNG GIAN LÀM VIỆC</p>
              <h1 className="text-[28px] font-semibold tracking-tight">{space.name}</h1>
              <p className="mt-2 text-sm text-muted">{space.description}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => openCreate({ kind: "doc", spaceId: space.id })} className={secondaryButton}>
              <Plus className="h-4 w-4" aria-hidden />
              Tài liệu
            </button>
            <button type="button" onClick={() => openCreate({ kind: "project", spaceId: space.id })} className={primaryButton}>
              <Plus className="h-4 w-4" aria-hidden />
              Dự án
            </button>
          </div>
        </div>
        <div className="mt-6 border-t border-[#F0EDF5] pt-3 text-sm">
          {space.driveFolderId ? (
            <a
              href={`https://drive.google.com/drive/folders/${encodeURIComponent(space.driveFolderId)}`}
              target="_blank"
              rel="noreferrer"
              className={cx(control, "inline-flex items-center gap-2 font-medium text-brand-ink")}
            >
              <FolderOpen className="h-4 w-4" aria-hidden />
              Mở thư mục Drive
              <ExternalLink className="h-4 w-4" aria-hidden />
            </a>
          ) : (
            <p className="py-2 text-xs text-muted">Chưa liên kết thư mục Google Drive · Giai đoạn 3 sẽ tự tạo khi tạo không gian.</p>
          )}
        </div>
      </header>

      <section aria-label="Tổng hợp không gian" className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Dự án đang chạy" value={spaceProjects.filter((p) => p.status === "ACTIVE").length} note={`${spaceProjects.length} dự án trong không gian`} icon={FolderOpen} style="bg-brand-soft text-brand" />
        <StatCard label="Công việc mở" value={spaceTasks.filter((t) => t.status !== "DONE").length} note="Cùng tiến về phía trước" icon={ListChecks} style="bg-blue-50 text-blue-700" />
        <StatCard label="Quá hạn" value={spaceTasks.filter((t) => isOverdue(t, today)).length} note="Cần ưu tiên xử lý" icon={Clock} style="bg-red-50 text-red-700" />
        <StatCard label="Tài liệu" value={spaceFiles.length} note="Ý tưởng và tài nguyên chung" icon={FileText} style="bg-emerald-50 text-emerald-700" />
      </section>

      <div role="tablist" aria-label="Nội dung không gian" className="flex gap-6 overflow-x-auto border-b border-[#E6E2EE]">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={cx(
              control,
              "flex shrink-0 items-center gap-2 rounded-none border-b-2 px-1 pb-3 text-sm",
              tab === item.id ? "border-brand font-semibold text-brand-ink" : "border-transparent text-muted",
            )}
          >
            <item.icon className="h-4 w-4" aria-hidden />
            {item.label}
            <span className="rounded-md bg-[#EBE7F3] px-1.5 py-0.5 text-xs">{counts[item.id]}</span>
          </button>
        ))}
      </div>

      <section role="tabpanel" aria-label={TABS.find((t) => t.id === tab)?.label}>
        {tab === "projects" && (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {spaceProjects
              .filter((p) => matchesQuery(query, p.name, p.description))
              .map((project) => {
                const items = spaceTasks.filter((t) => t.projectId === project.id);
                return (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    taskCount={items.length}
                    doneCount={items.filter((t) => t.status === "DONE").length}
                    fileCount={spaceFiles.filter((f) => f.projectId === project.id).length}
                  />
                );
              })}
            <button
              type="button"
              onClick={() => openCreate({ kind: "project", spaceId: space.id })}
              className={cx(control, "flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[#CFC4E3] bg-[#F4F1FA] p-6 text-brand-ink hover:bg-[#ECE5F8]")}
            >
              <span className="rounded-xl bg-[#E9E1F6] p-3">
                <Plus className="h-6 w-6" aria-hidden />
              </span>
              <span className="text-sm font-semibold">Tạo dự án mới</span>
              <span className="text-xs text-muted">Bắt đầu điều tiếp theo của bạn</span>
            </button>
          </div>
        )}

        {tab === "tasks" && (
          <div className={cx(card, "p-5")}>
            <SectionHeading title="Công việc trong không gian" action="Thêm công việc" onAction={() => openCreate({ kind: "task", spaceId: space.id })} />
            <ul>
              {spaceTasks
                .filter((t) => matchesQuery(query, t.title))
                .map((task) => (
                  <TaskListRow key={task.id} task={task} subtitle={projectName(task.projectId) ?? "Không gắn dự án"} />
                ))}
            </ul>
            {!spaceTasks.length && <p className="py-12 text-center text-sm text-muted">Chưa có công việc trong không gian này.</p>}
          </div>
        )}

        {tab === "docs" && (
          <div className={cx(card, "px-5 pb-3 pt-4")}>
            <SectionHeading title="Tài liệu trong không gian" action="Tạo tài liệu" onAction={() => openCreate({ kind: "doc", spaceId: space.id })} />
            {spaceFiles
              .filter((f) => matchesQuery(query, f.name))
              .map((file) => (
                <FileRow key={file.id} file={file} subtitle={projectName(file.projectId) ?? "Không gắn dự án"} />
              ))}
            {!spaceFiles.length && <p className="border-t border-line-soft py-10 text-center text-sm text-muted">Chưa có tài liệu. Tạo bản nháp đầu tiên của bạn.</p>}
          </div>
        )}
      </section>
    </div>
  );
}
