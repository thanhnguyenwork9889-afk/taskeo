"use client";

import { useSearchParams } from "next/navigation";
import { FileText, Plus } from "lucide-react";
import { matchesQuery, useUI } from "@/components/layout/ui-context";
import { EmptyState } from "@/components/ui/empty-state";
import { DOC_KIND_LABEL } from "@/domain/labels";
import type { DocKind } from "@/domain/types";
import { docKindSchema } from "@/domain/validation";
import { useWorkspace } from "@/store/workspace-store";
import { card, cx, primaryButton } from "@/components/ui/styles";
import { FileRow } from "./file-row";

export function DocsView() {
  const { files, spaces, projects } = useWorkspace();
  const { query, openCreate } = useUI();
  const parsed = docKindSchema.safeParse(useSearchParams().get("type"));
  const kind: DocKind | null = parsed.success ? parsed.data : null;

  const title = kind ? DOC_KIND_LABEL[kind] : "Kho lưu trữ";
  const create = () => openCreate({ kind: "doc", docKind: kind ?? undefined });
  const visible = [...files]
    .filter((f) => (!kind || f.kind === kind) && matchesQuery(query, f.name))
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="mb-2 text-xs text-muted">Workspace / {title}</p>
          <h1 className="text-[28px] font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-muted">Tài liệu Google của bạn, sắp xếp theo từng không gian.</p>
        </div>
        <button type="button" onClick={create} className={primaryButton}>
          <Plus className="h-4 w-4" aria-hidden />
          Tạo {kind ? DOC_KIND_LABEL[kind].toLowerCase() : "tài liệu"}
        </button>
      </div>
      {visible.length ? (
        <section className={cx(card, "px-5 pb-3 pt-2")}>
          {visible.map((file) => {
            const project = projects.find((p) => p.id === file.projectId)?.name;
            const space = spaces.find((s) => s.id === file.spaceId)?.name;
            return <FileRow key={file.id} file={file} subtitle={[project, space].filter(Boolean).join(" · ")} />;
          })}
        </section>
      ) : (
        <EmptyState
          icon={FileText}
          title="Ý tưởng bắt đầu từ trang trắng"
          description="Chưa có tài liệu ở đây. Tạo bản nháp đầu tiên và bắt đầu ghi lại ý tưởng."
          actionLabel="Tạo tài liệu"
          onAction={create}
        />
      )}
      <p className="text-xs text-muted">Giai đoạn 3: tạo Doc/Sheet/Slide thật trong thư mục Drive của không gian (scope drive.file).</p>
    </div>
  );
}
