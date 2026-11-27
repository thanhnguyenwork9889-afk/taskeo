"use client";

import { useState } from "react";
import { notFound, useParams } from "next/navigation";
import { Clock, ExternalLink, FileText, FolderOpen, ListChecks, Pencil, Plus, Trash2, type LucideIcon } from "lucide-react";
import { matchesQuery, useUI } from "@/components/layout/ui-context";
import { FileRow } from "@/features/docs/file-row";
import { TaskListRow } from "@/features/tasks/task-list-row";
import { SectionHeading } from "@/components/ui/section-heading";
import { SpaceIcon } from "@/components/ui/space-icon";
import type { Project, Space, Task, WorkspaceFile } from "@/domain/types";
import { isOverdue } from "@/domain/dates";
import { APP_NAME } from "@/config/app";
import { useWorkspace } from "@/store/workspace-store";
import { card, control, cx, primaryButton, secondaryButton } from "@/components/ui/styles";
import { ProjectCard } from "./project-card";
import { SpaceDeleteDialog } from "./space-delete-dialog";
import { SpaceEditDialog } from "./space-edit-dialog";

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

type Dialog = "edit" | "delete" | null;

function SpaceHeader({ space, onDeleting }: { space: Space; onDeleting: () => void }) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);
  return (
    <header className={cx(card, "relative overflow-hidden p-6 md:p-8")}>
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: space.color }} />
      <div className="flex flex-wrap items-center justify-between gap-6">
        <div className="flex min-w-0 items-center gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl" style={{ background: space.tint, color: space.color }}>
            <SpaceIcon icon={space.icon} className="h-8 w-8" />
          </span>
          <div className="min-w-0">
            <p className="mb-1.5 text-xs font-medium tracking-widest text-muted">KHÔNG GIAN LÀM VIỆC</p>
            <h1 className="text-[28px] font-semibold tracking-tight">{space.name}</h1>
            <p className="mt-2 text-sm text-muted">{space.description}</p>
          </div>
        </div>
        <HeaderActions spaceId={space.id} onEdit={() => setDialog("edit")} onDelete={() => setDialog("delete")} />
      </div>
      <DriveLink driveFolderId={space.driveFolderId} />
      {dialog === "edit" && <SpaceEditDialog space={space} onClose={close} />}
      {dialog === "delete" && <SpaceDeleteDialog space={space} onClose={close} onDeleting={onDeleting} />}
    </header>
  );
}

interface HeaderActionsProps {
  spaceId: string;
  onEdit: () => void;
  onDelete: () => void;
}

function HeaderActions({ spaceId, onEdit, onDelete }: HeaderActionsProps) {
  const { openCreate } = useUI();
  return (
    <div className="flex flex-wrap gap-3">
      <button type="button" onClick={onEdit} className={secondaryButton}>
        <Pencil className="h-4 w-4" aria-hidden />
        Sửa
      </button>
      <button type="button" onClick={onDelete} className={cx(secondaryButton, "text-red-700 hover:bg-red-50")}>
        <Trash2 className="h-4 w-4" aria-hidden />
        Xoá
      </button>
      <button type="button" onClick={() => openCreate({ kind: "doc", spaceId })} className={secondaryButton}>
        <Plus className="h-4 w-4" aria-hidden />
        Tài liệu
      </button>
      <button type="button" onClick={() => openCreate({ kind: "project", spaceId })} className={primaryButton}>
        <Plus className="h-4 w-4" aria-hidden />
        Dự án
      </button>
    </div>
  );
}

function DriveLink({ driveFolderId }: { driveFolderId: string | null }) {
  return (
    <div className="mt-6 border-t border-[#F0EDF5] pt-3 text-sm">
      {driveFolderId ? (
        <a
          href={`https://drive.google.com/drive/folders/${encodeURIComponent(driveFolderId)}`}
          target="_blank"
          rel="noreferrer"
          className={cx(control, "inline-flex items-center gap-2 font-medium text-brand-ink")}
        >
          <FolderOpen className="h-4 w-4" aria-hidden />
          Mở thư mục Drive
          <ExternalLink className="h-4 w-4" aria-hidden />
        </a>
      ) : (
        <p className="py-2 text-xs text-muted">Chưa có thư mục Google Drive. Thư mục được tạo khi tạo không gian lúc đã kết nối Drive.</p>
      )}
    </div>
  );
}

interface SpaceContent {
  spaceId: string;
  projects: Project[];
  tasks: Task[];
  files: WorkspaceFile[];
}

export function SpaceDetail() {
  const { id: spaceId } = useParams<{ id: string }>();
  const { spaces, projects, tasks, files } = useWorkspace();
  const { today } = useUI();
  const [tab, setTab] = useState<Tab>("projects");
  // Bật khi người dùng xoá không gian này: render rỗng trong lúc chuyển về /spaces thay vì nháy 404.
  const [leaving, setLeaving] = useState(false);

  const space = spaces.find((s) => s.id === spaceId);
  if (!space) {
    if (leaving) return null;
    notFound();
  }

  const content: SpaceContent = {
    spaceId: space.id,
    projects: projects.filter((p) => p.spaceId === space.id),
    tasks: tasks.filter((t) => t.spaceId === space.id),
    files: files.filter((f) => f.spaceId === space.id),
  };
  const counts: Record<Tab, number> = { projects: content.projects.length, tasks: content.tasks.length, docs: content.files.length };

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted">
        {APP_NAME} / Không gian / <span className="text-brand-ink">{space.name}</span>
      </p>
      <SpaceHeader space={space} onDeleting={() => setLeaving(true)} />

      <section aria-label="Tổng hợp không gian" className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Dự án đang chạy" value={content.projects.filter((p) => p.status === "ACTIVE").length} note={`${content.projects.length} dự án trong không gian`} icon={FolderOpen} style="bg-brand-soft text-brand" />
        <StatCard label="Công việc mở" value={content.tasks.filter((t) => t.status !== "DONE").length} note="Cùng tiến về phía trước" icon={ListChecks} style="bg-blue-50 text-blue-700" />
        <StatCard label="Quá hạn" value={content.tasks.filter((t) => isOverdue(t, today)).length} note="Cần ưu tiên xử lý" icon={Clock} style="bg-red-50 text-red-700" />
        <StatCard label="Tài liệu" value={content.files.length} note="Ý tưởng và tài nguyên chung" icon={FileText} style="bg-emerald-50 text-emerald-700" />
      </section>

      <SpaceTabs tab={tab} counts={counts} onSelect={setTab} />

      <section role="tabpanel" aria-label={TABS.find((t) => t.id === tab)?.label}>
        {tab === "projects" && <ProjectsPanel {...content} />}
        {tab === "tasks" && <TasksPanel {...content} />}
        {tab === "docs" && <DocsPanel {...content} />}
      </section>
    </div>
  );
}

function SpaceTabs({ tab, counts, onSelect }: { tab: Tab; counts: Record<Tab, number>; onSelect: (tab: Tab) => void }) {
  return (
    <div role="tablist" aria-label="Nội dung không gian" className="flex gap-6 overflow-x-auto border-b border-[#E6E2EE]">
      {TABS.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={tab === item.id}
          onClick={() => onSelect(item.id)}
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
  );
}

function ProjectsPanel({ spaceId, projects, tasks, files }: SpaceContent) {
  const { query, openCreate } = useUI();
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {projects
        .filter((p) => matchesQuery(query, p.name, p.description))
        .map((project) => {
          const items = tasks.filter((t) => t.projectId === project.id);
          return (
            <ProjectCard
              key={project.id}
              project={project}
              taskCount={items.length}
              doneCount={items.filter((t) => t.status === "DONE").length}
              fileCount={files.filter((f) => f.projectId === project.id).length}
            />
          );
        })}
      <button
        type="button"
        onClick={() => openCreate({ kind: "project", spaceId })}
        className={cx(control, "flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[#CFC4E3] bg-[#F4F1FA] p-6 text-brand-ink hover:bg-[#ECE5F8]")}
      >
        <span className="rounded-xl bg-[#E9E1F6] p-3">
          <Plus className="h-6 w-6" aria-hidden />
        </span>
        <span className="text-sm font-semibold">Tạo dự án mới</span>
        <span className="text-xs text-muted">Bắt đầu điều tiếp theo của bạn</span>
      </button>
    </div>
  );
}

const projectNameIn = (projects: Project[], id: string | null) => projects.find((p) => p.id === id)?.name ?? "Không gắn dự án";

function TasksPanel({ spaceId, projects, tasks }: SpaceContent) {
  const { query, openCreate } = useUI();
  return (
    <div className={cx(card, "p-5")}>
      <SectionHeading title="Công việc trong không gian" action="Thêm công việc" onAction={() => openCreate({ kind: "task", spaceId })} />
      <ul>
        {tasks
          .filter((t) => matchesQuery(query, t.title))
          .map((task) => (
            <TaskListRow key={task.id} task={task} subtitle={projectNameIn(projects, task.projectId)} />
          ))}
      </ul>
      {!tasks.length && <p className="py-12 text-center text-sm text-muted">Chưa có công việc trong không gian này.</p>}
    </div>
  );
}

function DocsPanel({ spaceId, projects, files }: SpaceContent) {
  const { query, openCreate } = useUI();
  return (
    <div className={cx(card, "px-5 pb-3 pt-4")}>
      <SectionHeading title="Tài liệu trong không gian" action="Tạo tài liệu" onAction={() => openCreate({ kind: "doc", spaceId })} />
      {files
        .filter((f) => matchesQuery(query, f.name))
        .map((file) => (
          <FileRow key={file.id} file={file} subtitle={projectNameIn(projects, file.projectId)} />
        ))}
      {!files.length && <p className="border-t border-line-soft py-10 text-center text-sm text-muted">Chưa có tài liệu. Tạo bản nháp đầu tiên của bạn.</p>}
    </div>
  );
}
