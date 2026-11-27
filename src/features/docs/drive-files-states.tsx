"use client";

import { AlertTriangle, RotateCw } from "lucide-react";
import { cx, secondaryButton } from "@/components/ui/styles";
import { driveFilesErrorInfo } from "./drive-files-state";

// Các trạng thái phụ của danh sách file Drive (T015): mời kết nối, đang tải, lỗi.
// Chỉ vẽ phần nội dung; khung (card) do nơi dùng quyết định.
// `DriveConnectPrompt` đã chuyển sang `components/layout` (T017); re-export để chỗ dùng cũ không đổi.

export { DriveConnectPrompt } from "@/components/layout/drive-connect-prompt";

const blockClass = "flex flex-col items-center border-t border-line-soft px-4 py-8 text-center";

/** Khung chờ: vài dòng giả có cùng chiều cao với `FileRow`. */
export function DriveFilesSkeleton({ rows }: { rows: number }) {
  return (
    <div role="status" aria-label="Đang tải tài liệu">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} aria-hidden className="flex min-h-11 items-center gap-3 border-t border-line-soft py-3">
          <span className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-brand-faint" />
          <span className="min-w-0 flex-1 space-y-2">
            <span className="block h-3 w-1/2 animate-pulse rounded bg-brand-faint" />
            <span className="block h-2.5 w-1/3 animate-pulse rounded bg-brand-faint" />
          </span>
        </div>
      ))}
    </div>
  );
}

interface DriveFilesErrorProps {
  onRetry: () => void;
  retrying: boolean;
  /** Lỗi từ query; quyết định câu giải thích và có hiện nút "Thử lại" hay không. */
  error?: unknown;
}

/** Không tải được danh sách. Lỗi mạng / 5xx có nút "Thử lại"; 4xx (vd. 401 hết phiên) thì không. */
export function DriveFilesError({ onRetry, retrying, error }: DriveFilesErrorProps) {
  const { message, canRetry } = driveFilesErrorInfo(error);
  return (
    <div role="alert" className={blockClass}>
      <AlertTriangle className="mb-3 h-8 w-8 text-red-700" aria-hidden />
      <p className="text-sm font-medium">Không tải được tài liệu từ Google Drive</p>
      <p className={cx("mt-2 max-w-sm text-sm leading-6 text-muted", canRetry && "mb-5")}>{message}</p>
      {canRetry && (
        <button type="button" onClick={onRetry} disabled={retrying} className={cx(secondaryButton, "disabled:cursor-wait disabled:opacity-60")}>
          <RotateCw className={cx("h-4 w-4", retrying && "animate-spin")} aria-hidden />
          {retrying ? "Đang thử lại…" : "Thử lại"}
        </button>
      )}
    </div>
  );
}
