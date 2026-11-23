import Link from "next/link";
import { CalendarDays, FileText, FolderOpen } from "lucide-react";
import { ProjectStatusBadge } from "@/components/ui/badges";
import { percentOf, ProgressBar } from "@/components/ui/progress-bar";
import { formatFullDate } from "@/domain/dates";
import { PROJECT_STATUS_STYLE } from "@/domain/labels";
import type { Project } from "@/domain/types";
import { card, control, cx } from "@/components/ui/styles";

interface ProjectCardProps {
  project: Project;
  taskCount: number;
  doneCount: number;
  fileCount: number;
}

export function ProjectCard({ project, taskCount, doneCount, fileCount }: ProjectCardProps) {
  const percent = percentOf(doneCount, taskCount);
  const accent = PROJECT_STATUS_STYLE[project.status].accent;
  return (
    <Link href={`/projects/${project.id}`} className={cx(control, card, "flex flex-col p-5 hover:border-[#C3B3E2]")}>
      <div className="mb-5 flex w-full items-center justify-between gap-2">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft" style={{ color: accent }}>
          <FolderOpen className="h-5 w-5" aria-hidden />
        </span>
        <ProjectStatusBadge status={project.status} />
      </div>
      <h3 className="text-lg font-semibold tracking-tight">{project.name}</h3>
      <p className="mb-6 mt-2 min-h-10 text-sm leading-5 text-muted">{project.description}</p>
      <div className="mt-auto w-full">
        <div className="mb-2.5 flex items-center justify-between text-xs text-muted">
          <span>
            {doneCount}/{taskCount} công việc
          </span>
          <span className="font-medium" style={{ color: accent }}>
            {percent}%
          </span>
        </div>
        <ProgressBar label={`Tiến độ ${project.name}`} percent={percent} color={accent} />
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-[#F0EDF5] pt-4 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
            {project.dueDate ? formatFullDate(project.dueDate) : "Chưa đặt hạn"}
          </span>
          <span className="flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" aria-hidden />
            {fileCount} tài liệu
          </span>
        </div>
      </div>
    </Link>
  );
}
