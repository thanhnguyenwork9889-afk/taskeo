"use client";

import { ArrowUpRight } from "lucide-react";
import { useUI } from "@/components/layout/ui-context";
import { DocIcon } from "@/components/ui/doc-icon";
import { timeAgo } from "@/domain/dates";
import type { WorkspaceFile } from "@/domain/types";
import { isDriveUrl } from "@/domain/validation";
import { control, cx } from "@/components/ui/styles";

interface FileRowProps {
  /** `WorkspaceFile` (store demo) hoặc `DriveFileItem` (API) đều vừa. */
  file: Pick<WorkspaceFile, "name" | "kind" | "modifiedAt" | "url"> & { shortcut?: boolean };
  subtitle: string;
  /** Dữ liệu mẫu: bấm file chưa có url thì báo đây là tài liệu mẫu. */
  demo?: boolean;
}

/** Nhãn cho lối tắt Drive (file gốc nằm chỗ khác, được gắn vào thư mục Taskeo). */
function AttachedBadge() {
  return (
    <span
      title="Lối tắt tới file gốc trên Drive, được gắn vào thư mục Taskeo"
      className="shrink-0 rounded-md bg-[#F0EBF8] px-2 py-0.5 text-xs text-brand-ink"
    >
      Đã gắn
    </span>
  );
}

const rowLayout = "flex w-full items-center gap-3 border-t border-line-soft py-3 text-left";

/**
 * Một dòng tài liệu. File có url Drive hợp lệ thì mở Google trong tab mới.
 * Không có url: demo → nút báo tài liệu mẫu; dữ liệu thật → dòng không bấm được.
 */
export function FileRow({ file, subtitle, demo = false }: FileRowProps) {
  const { notify, now } = useUI();
  // Kiểm tra lại ngay trước khi render href, phòng dữ liệu không đi qua schema.
  const safeUrl = file.url && isDriveUrl(file.url) ? file.url : null;
  const className = cx(control, rowLayout, "hover:bg-brand-faint");
  const content = (
    <>
      <DocIcon kind={file.kind} />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">{file.name}</span>
          {file.shortcut && <AttachedBadge />}
        </span>
        <span className="mt-1 block truncate text-xs text-muted">{subtitle}</span>
      </span>
      <span className="hidden whitespace-nowrap text-xs text-muted sm:block">{timeAgo(file.modifiedAt, now)}</span>
      {safeUrl && <ArrowUpRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />}
    </>
  );
  if (safeUrl) {
    return (
      <a href={safeUrl} target="_blank" rel="noreferrer" className={className}>
        {content}
      </a>
    );
  }
  if (demo) {
    return (
      <button type="button" onClick={() => notify("Tài liệu mẫu — giai đoạn 3 sẽ mở file thật trên Google Drive.")} className={className}>
        {content}
      </button>
    );
  }
  return (
    <div title="Không mở được tài liệu này" className={cx(rowLayout, "min-h-11")}>
      {content}
    </div>
  );
}
