"use client";

import Link from "next/link";
import { FolderOpen } from "lucide-react";
import { matchesQuery, useUI } from "@/components/layout/ui-context";
import { SectionHeading } from "@/components/ui/section-heading";
import { useWorkspace } from "@/store/workspace-store";
import { card, control, cx } from "@/components/ui/styles";

export function SpacesCard() {
  const { spaces, projects, tasks, files } = useWorkspace();
  const { query } = useUI();
  const visible = spaces.filter((s) => matchesQuery(query, s.name));

  return (
    <section className={cx(card, "px-5 pb-5 pt-4")}>
      <SectionHeading title="Không gian của bạn" action="Tất cả không gian" href="/spaces" />
      <div className="grid gap-3 md:grid-cols-2">
        {visible.map((space) => {
          const counts = [
            `${projects.filter((p) => p.spaceId === space.id).length} dự án`,
            `${tasks.filter((t) => t.spaceId === space.id).length} công việc`,
            `${files.filter((f) => f.spaceId === space.id).length} tài liệu`,
          ];
          return (
            <Link
              key={space.id}
              href={`/spaces/${space.id}`}
              className={cx(control, "flex min-w-0 items-center gap-3 border border-[#ECE9F2] p-3 hover:bg-brand-faint")}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: space.tint, color: space.color }}>
                <FolderOpen className="h-[18px] w-[18px]" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{space.name}</span>
                <span className="mt-1.5 block text-xs leading-5 text-muted">{counts.join(" · ")}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
