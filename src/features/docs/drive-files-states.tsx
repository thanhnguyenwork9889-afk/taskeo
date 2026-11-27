"use client";

import { useFormStatus } from "react-dom";
import { usePathname, useSearchParams } from "next/navigation";
import { AlertTriangle, HardDrive, RotateCw } from "lucide-react";
import { connectGoogleDrive } from "@/server/auth/actions";
import { currentLocation } from "@/components/layout/drive-status";
import { cx, primaryButton, secondaryButton } from "@/components/ui/styles";

// Các trạng thái phụ của danh sách file Drive (T015): mời kết nối, đang tải, lỗi.
// Chỉ vẽ phần nội dung; khung (card) do nơi dùng quyết định.

const blockClass = "flex flex-col items-center border-t border-line-soft px-4 py-8 text-center";

/** Lời mời kết nối Google Drive; submit `connectGoogleDrive` rồi quay lại đúng trang hiện tại. */
export function DriveConnectPrompt() {
  const pathname = usePathname();
  const redirectTo = currentLocation(pathname, useSearchParams().toString());
  return (
    <div className={blockClass}>
      <HardDrive className="mb-3 h-8 w-8 text-brand" aria-hidden />
      <p className="text-sm font-medium">Kết nối Google Drive để xem tài liệu</p>
      <p className="mb-5 mt-2 max-w-sm text-sm leading-6 text-muted">
        Taskeo chỉ xin quyền với các file do Taskeo tạo hoặc bạn mở bằng Taskeo.
      </p>
      <form action={connectGoogleDrive}>
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <ConnectButton />
      </form>
    </div>
  );
}

function ConnectButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={cx(primaryButton, "disabled:cursor-wait disabled:opacity-60")}>
      <HardDrive className="h-4 w-4" aria-hidden />
      {pending ? "Đang chuyển tới Google…" : "Kết nối Google Drive"}
    </button>
  );
}

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
}

/** Không tải được danh sách (Google lỗi / mạng). Nút "Thử lại" gọi lại API. */
export function DriveFilesError({ onRetry, retrying }: DriveFilesErrorProps) {
  return (
    <div role="alert" className={blockClass}>
      <AlertTriangle className="mb-3 h-8 w-8 text-red-700" aria-hidden />
      <p className="text-sm font-medium">Không tải được tài liệu từ Google Drive</p>
      <p className="mb-5 mt-2 max-w-sm text-sm leading-6 text-muted">Có thể Google đang bận hoặc mạng chập chờn. Hãy thử lại sau giây lát.</p>
      <button type="button" onClick={onRetry} disabled={retrying} className={cx(secondaryButton, "disabled:cursor-wait disabled:opacity-60")}>
        <RotateCw className={cx("h-4 w-4", retrying && "animate-spin")} aria-hidden />
        {retrying ? "Đang thử lại…" : "Thử lại"}
      </button>
    </div>
  );
}
