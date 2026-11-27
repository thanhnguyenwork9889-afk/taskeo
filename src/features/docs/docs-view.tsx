"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { FileText, Plus } from "lucide-react";
import { matchesQuery, useUI, useViewer } from "@/components/layout/ui-context";
import { EmptyState } from "@/components/ui/empty-state";
import { DOC_KIND_LABEL } from "@/domain/labels";
import type { DocKind } from "@/domain/types";
import { docKindSchema } from "@/domain/validation";
import { APP_NAME } from "@/config/app";
import { useWorkspace } from "@/store/workspace-store";
import { card, cx, primaryButton } from "@/components/ui/styles";
import { DriveConnectPrompt, DriveFilesError, DriveFilesSkeleton } from "./drive-files-states";
import { driveFileSubtitle } from "./drive-files-state";
import { FileRow } from "./file-row";
import { useDriveFileList } from "./use-drive-files";

/** Kho lưu trữ hiện tối đa bấy nhiêu file Drive (giới hạn trên của API, chưa phân trang). */
const DOCS_LIMIT = 100;
const SKELETON_ROWS = 5;
const listCard = cx(card, "px-5 pb-3 pt-2");

export function DocsView() {
  const { openCreate } = useUI();
  const parsed = docKindSchema.safeParse(useSearchParams().get("type"));
  const kind: DocKind | null = parsed.success ? parsed.data : null;
  const title = kind ? DOC_KIND_LABEL[kind] : "Kho lưu trữ";
  const create = () => openCreate({ kind: "doc", docKind: kind ?? undefined });
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="mb-2 text-xs text-muted">{APP_NAME} / {title}</p>
          <h1 className="text-[28px] font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-muted">Tài liệu Google của bạn, sắp xếp theo từng không gian.</p>
        </div>
        <button type="button" onClick={create} className={primaryButton}>
          <Plus className="h-4 w-4" aria-hidden />
          Tạo {kind ? DOC_KIND_LABEL[kind].toLowerCase() : "tài liệu"}
        </button>
      </div>
      <Suspense fallback={<section className={listCard}><DriveFilesSkeleton rows={SKELETON_ROWS} /></section>}>
        <DocsBody kind={kind} onCreate={create} />
      </Suspense>
    </div>
  );
}

function DocsBody({ kind, onCreate }: { kind: DocKind | null; onCreate: () => void }) {
  const { isDemo } = useViewer();
  return (
    <>
      {isDemo ? <DemoDocsList kind={kind} onCreate={onCreate} /> : <DriveDocsList kind={kind} />}
      <p className="text-xs text-muted">
        {isDemo
          ? "Chế độ demo: tài liệu mẫu lưu trong trình duyệt này, chưa nối với Google Drive."
          : "Tài liệu thật trong các thư mục Drive của Taskeo. Với quyền drive.file, Taskeo chỉ thấy file do Taskeo tạo hoặc bạn mở bằng Taskeo; file tự tạo trực tiếp trên Drive sẽ không hiện ở đây."}
      </p>
    </>
  );
}

/** Chế độ demo: dữ liệu mẫu trong store, tạo bản nháp lưu ngay vào store. */
function DemoDocsList({ kind, onCreate }: { kind: DocKind | null; onCreate: () => void }) {
  const { files, spaces, projects } = useWorkspace();
  const { query } = useUI();
  const visible = [...files]
    .filter((f) => (!kind || f.kind === kind) && matchesQuery(query, f.name))
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  if (!visible.length) {
    return (
      <EmptyState
        icon={FileText}
        title="Ý tưởng bắt đầu từ trang trắng"
        description="Chưa có tài liệu ở đây. Tạo bản nháp đầu tiên và bắt đầu ghi lại ý tưởng."
        actionLabel="Tạo tài liệu"
        onAction={onCreate}
      />
    );
  }
  return (
    <section className={listCard}>
      {visible.map((file) => {
        const project = projects.find((p) => p.id === file.projectId)?.name;
        const space = spaces.find((s) => s.id === file.spaceId)?.name;
        return <FileRow key={file.id} file={file} subtitle={[project, space].filter(Boolean).join(" · ")} demo />;
      })}
    </section>
  );
}

/** Chế độ configured: file thật trong thư mục Drive của Taskeo, lọc loại qua `?type=`. */
function DriveDocsList({ kind }: { kind: DocKind | null }) {
  const { query } = useUI();
  const { state, files, retry, retrying } = useDriveFileList({ kind: kind ?? undefined, limit: DOCS_LIMIT }, query);
  if (state === "list") {
    return (
      <section className={listCard}>
        {files.map((file) => (
          <FileRow key={file.id} file={file} subtitle={driveFileSubtitle(file)} />
        ))}
      </section>
    );
  }
  if (state === "empty" || state === "demo") return <DriveDocsEmpty kind={kind} searching={Boolean(query.trim())} />;
  return (
    <section className={listCard}>
      {state === "connect" && <DriveConnectPrompt />}
      {state === "loading" && <DriveFilesSkeleton rows={SKELETON_ROWS} />}
      {state === "error" && <DriveFilesError onRetry={retry} retrying={retrying} />}
    </section>
  );
}

/** Rỗng ở chế độ configured: không mời tạo bản nháp vì tạo file Drive thật chưa có (T32). */
function DriveDocsEmpty({ kind, searching }: { kind: DocKind | null; searching: boolean }) {
  const none = kind ? `Chưa có tài liệu nào ở mục ${DOC_KIND_LABEL[kind]}` : "Chưa có tài liệu Google nào";
  return (
    <EmptyState
      icon={FileText}
      title={searching ? "Không có tài liệu khớp tìm kiếm" : none}
      description={
        searching
          ? "Thử từ khoá khác hoặc xoá ô tìm kiếm."
          : "Taskeo chỉ thấy file do Taskeo tạo hoặc bạn mở bằng Taskeo trong thư mục Drive của Taskeo."
      }
    />
  );
}
