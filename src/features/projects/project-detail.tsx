"use client";

import { useState } from "react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { CalendarDays, FileText, FolderOpen, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { matchesQuery, useUI } from "@/components/layout/ui-context";
import { AttachDriveButton } from "@/features/docs/attach-drive-button";
import { FileRow } from "@/features/docs/file-row";
import { percentOf, ProgressBar } from "@/components/ui/progress-bar";
import { PROJECT_STATUS_LABEL, PROJECT_STATUSES } from "@/domain/labels";
import type { Project, ProjectStatus } from "@/domain/types";
import { updateProject } from "@/domain/workspace-actions";
import { updateWorkspace, useWorkspace } from "@/store/workspace-store";
import { card, control, cx, field, primaryButton, secondaryButton } from "@/components/ui/styles";
import { AttachDriveDialog } from "./attach-drive-dialog";
import { ProjectDeleteDialog } from "./project-delete-dialog";
import { ProjectEditDialog } from "./project-edit-dialog";
import { ProjectTasks } from "./project-tasks";

type Dialog = "edit" | "delete" | null;

/** Nút Sửa / Xoá / trạng thái ở header, kèm hộp thoại tương ứng. */
function ProjectHeaderActions({ project, onDeleting }: { project: Project; onDeleting: () => void }) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={() => setDialog("edit")} className={secondaryButton}>
        <Pencil className="h-4 w-4" aria-hidden />
        Sửa
      </button>
      <button type="button" onClick={() => setDialog("delete")} className={cx(secondaryButton, "text-red-700 hover:bg-red-50")}>
        <Trash2 className="h-4 w-4" aria-hidden />
        Xoá
      </button>
      <select
        aria-label="Trạng thái dự án"
        value={project.status}
        onChange={(event) => updateWorkspace((s) => updateProject(s, project.id, { status: event.target.value as ProjectStatus }))}
        className={cx(control, "border border-blue-100 bg-blue-50 px-3 text-sm font-medium text-blue-700")}
      >
        {PROJECT_STATUSES.map((status) => (
          <option key={status} value={status}>
            {PROJECT_STATUS_LABEL[status]}
          </option>
        ))}
      </select>
      {dialog === "edit" && <ProjectEditDialog project={project} onClose={close} />}
      {dialog === "delete" && <ProjectDeleteDialog project={project} onClose={close} onDeleting={onDeleting} />}
    </div>
  );
}

export function ProjectDetail() {
  const { id: projectId } = useParams<{ id: string }>();
  const { projects, spaces, tasks, files } = useWorkspace();
  const { query, openCreate } = useUI();
  const [attaching, setAttaching] = useState(false);
  // Bật khi người dùng xoá dự án này: render rỗng trong lúc chuyển về trang không gian thay vì nháy 404.
  const [deleting, setDeleting] = useState(false);

  const project = projects.find((p) => p.id === projectId);
  if (!project) {
    if (deleting) return null;
    notFound();
  }
  const space = spaces.find((s) => s.id === project.spaceId);

  const items = tasks.filter((t) => t.projectId === project.id);
  const done = items.filter((t) => t.status === "DONE").length;
  const percent = percentOf(done, items.length);
  const projectFiles = files.filter((f) => f.projectId === project.id);

  return (
    <div className="space-y-6">
      <nav aria-label="Đường dẫn dự án" className="flex flex-wrap items-center gap-2 text-sm">
        {space && (
          <Link href={`/spaces/${space.id}`} className={cx(control, "flex items-center gap-2 text-muted")}>
            <span className="h-2 w-2 rounded-full" style={{ background: space.color }} />
            {space.name}
          </Link>
        )}
        <span className="text-muted">/</span>
        <span className="font-medium text-brand-ink">{project.name}</span>
      </nav>

      <header className={cx(card, "p-6 md:p-7")}>
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex min-w-0 items-start gap-4">
            <span className="rounded-xl bg-brand-soft p-3 text-brand">
              <FolderOpen className="h-6 w-6" aria-hidden />
            </span>
            <div className="min-w-0">
              <h1 className="text-[28px] font-semibold tracking-tight">{project.name}</h1>
              <p className="mt-2 text-sm leading-6 text-muted">{project.description}</p>
            </div>
          </div>
          <ProjectHeaderActions project={project} onDeleting={() => setDeleting(true)} />
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-4 border-t border-[#EFECF4] pt-5">
          <label className="flex items-center gap-2 text-sm text-muted">
            <CalendarDays className="h-4 w-4" aria-hidden />
            Hạn chót
            <input
              type="date"
              value={project.dueDate ?? ""}
              onChange={(event) => updateWorkspace((s) => updateProject(s, project.id, { dueDate: event.target.value || null }))}
              className={cx(field, "w-auto max-w-44")}
            />
          </label>
          <div className="min-w-48 flex-1 md:max-w-sm">
            <div className="mb-2 flex justify-between text-xs text-muted">
              <span>
                Tiến độ · {done}/{items.length} công việc
              </span>
              <span className="font-semibold text-brand-ink">{percent}%</span>
            </div>
            <ProgressBar label="Tiến độ dự án" percent={percent} />
          </div>
          <span className="flex items-center gap-2 text-sm text-muted">
            <FileText className="h-4 w-4" aria-hidden />
            {projectFiles.length} tài liệu
          </span>
        </div>
      </header>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <ProjectTasks project={project} tasks={items} />
        <aside className="min-w-0 space-y-4">
          <section className={cx(card, "px-5 pb-5 pt-4")}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Tài liệu dự án</h2>
              <span className="rounded-md bg-[#F0EBF8] px-2 py-1 text-xs text-brand-ink">{projectFiles.length}</span>
            </div>
            {projectFiles
              .filter((f) => matchesQuery(query, f.name))
              .map((file) => (
                <FileRow key={file.id} file={file} subtitle={file.url ? "Liên kết Drive" : "Tài liệu mẫu"} demo />
              ))}
            {!projectFiles.length && <p className="py-5 text-sm text-muted">Chưa có tài liệu trong dự án.</p>}
            <div className="mt-5 grid gap-3">
              <button type="button" onClick={() => openCreate({ kind: "doc", spaceId: project.spaceId, projectId: project.id })} className={primaryButton}>
                <Plus className="h-4 w-4" aria-hidden />
                Tạo tài liệu
              </button>
              <AttachDriveButton spaceId={project.spaceId} projectId={project.id} onDemoAttach={() => setAttaching(true)} />
            </div>
          </section>
          <div className="flex items-start gap-3 rounded-xl border border-[#E7E0F2] bg-brand-soft p-4">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
            <p className="text-sm leading-6 text-[#655577]">Ý tưởng, công việc và tài liệu — luôn ở cạnh nhau để bạn tập trung sáng tạo.</p>
          </div>
        </aside>
      </div>
      {attaching && <AttachDriveDialog project={project} onClose={() => setAttaching(false)} />}
    </div>
  );
}
