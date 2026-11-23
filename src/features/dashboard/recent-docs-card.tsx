"use client";

import { matchesQuery, useUI } from "@/components/layout/ui-context";
import { FileRow } from "@/features/docs/file-row";
import { SectionHeading } from "@/components/ui/section-heading";
import { useWorkspace } from "@/store/workspace-store";
import { card, cx } from "@/components/ui/styles";

const RECENT_LIMIT = 4;

export function RecentDocsCard() {
  const { files, spaces, projects } = useWorkspace();
  const { query } = useUI();
  const recent = [...files]
    .filter((f) => matchesQuery(query, f.name))
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
    .slice(0, RECENT_LIMIT);

  return (
    <section className={cx(card, "px-5 pb-3 pt-4")}>
      <SectionHeading title="Tài liệu gần đây" action="Tất cả tệp" href="/docs" />
      {recent.map((file) => {
        const project = projects.find((p) => p.id === file.projectId)?.name;
        const space = spaces.find((s) => s.id === file.spaceId)?.name;
        return <FileRow key={file.id} file={file} subtitle={[project, space].filter(Boolean).join(" · ")} />;
      })}
      {!recent.length && <p className="border-t border-line-soft py-8 text-center text-sm text-muted">Chưa có tài liệu phù hợp.</p>}
    </section>
  );
}
