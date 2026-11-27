"use client";

import { Suspense } from "react";
import { matchesQuery, useUI, useViewer } from "@/components/layout/ui-context";
import { FileRow } from "@/features/docs/file-row";
import { DriveConnectPrompt, DriveFilesError, DriveFilesSkeleton } from "@/features/docs/drive-files-states";
import { driveFileSubtitle } from "@/features/docs/drive-files-state";
import { useDriveFileList } from "@/features/docs/use-drive-files";
import { SectionHeading } from "@/components/ui/section-heading";
import { useWorkspace } from "@/store/workspace-store";
import { card, cx } from "@/components/ui/styles";

const RECENT_LIMIT = 4;
/**
 * Lấy dư rồi mới lọc theo ô tìm kiếm + cắt 4: nếu chỉ lấy 4 thì tìm kiếm chỉ lọc trong 4 file mới nhất.
 * Giữ cố định (không phụ thuộc `query`) để gõ tìm kiếm không gọi lại API.
 */
const RECENT_FETCH_LIMIT = 20;

export function RecentDocsCard() {
  return (
    <section className={cx(card, "px-5 pb-3 pt-4")}>
      <SectionHeading title="Tài liệu gần đây" action="Tất cả tệp" href="/docs" />
      <Suspense fallback={<DriveFilesSkeleton rows={RECENT_LIMIT} />}>
        <RecentDocsBody />
      </Suspense>
    </section>
  );
}

function RecentDocsBody() {
  const { isDemo } = useViewer();
  return isDemo ? <DemoRecentDocs /> : <DriveRecentDocs />;
}

function NoRecentDocs() {
  return <p className="border-t border-line-soft py-8 text-center text-sm text-muted">Chưa có tài liệu phù hợp.</p>;
}

/** Chế độ demo: dữ liệu mẫu trong store. */
function DemoRecentDocs() {
  const { files, spaces, projects } = useWorkspace();
  const { query } = useUI();
  const recent = [...files]
    .filter((f) => matchesQuery(query, f.name))
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
    .slice(0, RECENT_LIMIT);
  if (!recent.length) return <NoRecentDocs />;
  return recent.map((file) => {
    const project = projects.find((p) => p.id === file.projectId)?.name;
    const space = spaces.find((s) => s.id === file.spaceId)?.name;
    return <FileRow key={file.id} file={file} subtitle={[project, space].filter(Boolean).join(" · ")} demo />;
  });
}

/** Chế độ configured: file thật trong thư mục Drive của Taskeo. */
function DriveRecentDocs() {
  const { query } = useUI();
  const { state, files, retry, retrying } = useDriveFileList({ limit: RECENT_FETCH_LIMIT }, query);
  if (state === "connect") return <DriveConnectPrompt />;
  if (state === "loading") return <DriveFilesSkeleton rows={RECENT_LIMIT} />;
  if (state === "error") return <DriveFilesError onRetry={retry} retrying={retrying} />;
  if (state !== "list") return <NoRecentDocs />;
  return files
    .slice(0, RECENT_LIMIT)
    .map((file) => <FileRow key={file.id} file={file} subtitle={driveFileSubtitle(file)} />);
}
