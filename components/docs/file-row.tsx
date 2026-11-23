"use client";

import { ArrowUpRight } from "lucide-react";
import { useUI } from "@/components/shell/ui-context";
import { DocIcon } from "@/components/ui/doc-icon";
import { timeAgo } from "@/lib/dates";
import type { WorkspaceFile } from "@/lib/types";
import { isDriveUrl } from "@/lib/validation";
import { control, cx } from "@/lib/ui";

interface FileRowProps {
  file: WorkspaceFile;
  subtitle: string;
}

/** Một dòng tài liệu. File có url thì mở Google trong tab mới; chưa có thì báo chưa kết nối. */
export function FileRow({ file, subtitle }: FileRowProps) {
  const { notify, now } = useUI();
  // Kiểm tra lại ngay trước khi render href, phòng dữ liệu không đi qua schema.
  const safeUrl = file.url && isDriveUrl(file.url) ? file.url : null;
  const className = cx(control, "flex w-full items-center gap-3 border-t border-line-soft py-3 text-left hover:bg-brand-faint");
  const content = (
    <>
      <DocIcon kind={file.kind} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{file.name}</span>
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
  return (
    <button type="button" onClick={() => notify("Tài liệu mẫu — giai đoạn 3 sẽ mở file thật trên Google Drive.")} className={className}>
      {content}
    </button>
  );
}
