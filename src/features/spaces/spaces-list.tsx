"use client";

import Link from "next/link";
import { ArrowRight, FolderOpen } from "lucide-react";
import { matchesQuery, useUI } from "@/components/layout/ui-context";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { SpaceIcon } from "@/components/ui/space-icon";
import { useWorkspace } from "@/store/workspace-store";
import { card, control, cx } from "@/components/ui/styles";

export function SpacesList() {
  const { spaces } = useWorkspace();
  const { query, openCreate } = useUI();
  const create = () => openCreate({ kind: "space" });
  const visible = spaces.filter((s) => matchesQuery(query, s.name, s.description));

  if (!spaces.length) {
    return (
      <EmptyState
        icon={FolderOpen}
        title="Chỗ cho những ý tưởng lớn"
        description="Tạo không gian để gom dự án, công việc và tài liệu theo cách của bạn."
        actionLabel="Tạo không gian đầu tiên"
        onAction={create}
      />
    );
  }

  return (
    <section>
      <SectionHeading title="Không gian của bạn" action="Tạo không gian" onAction={create} />
      <div className="grid gap-4 md:grid-cols-2">
        {visible.map((space) => (
          <Link key={space.id} href={`/spaces/${space.id}`} className={cx(control, card, "flex items-center gap-4 p-5 hover:border-[#C6B5E8]")}>
            <span className="rounded-xl p-3" style={{ background: space.tint, color: space.color }}>
              <SpaceIcon icon={space.icon} className="h-6 w-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-lg font-semibold">{space.name}</span>
              <span className="mt-1 block text-sm text-muted">{space.description}</span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-brand" aria-hidden />
          </Link>
        ))}
      </div>
    </section>
  );
}
