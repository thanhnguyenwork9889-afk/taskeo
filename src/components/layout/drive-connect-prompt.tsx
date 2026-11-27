"use client";

import { useFormStatus } from "react-dom";
import { usePathname, useSearchParams } from "next/navigation";
import { HardDrive } from "lucide-react";
import { connectGoogleDrive } from "@/server/auth/actions";
import { cx, primaryButton } from "@/components/ui/styles";
import { currentLocation } from "./drive-status";

// Lời mời kết nối Google Drive (T015, chuyển từ `features/docs` ở T017 để hộp thoại tạo tài liệu dùng lại).

const blockClass = "flex flex-col items-center border-t border-line-soft px-4 py-8 text-center";
const DEFAULT_TITLE = "Kết nối Google Drive để xem tài liệu";
const DEFAULT_DESCRIPTION = "Taskeo chỉ xin quyền với các file do Taskeo tạo hoặc bạn mở bằng Taskeo.";

interface DriveConnectPromptProps {
  title?: string;
  description?: string;
}

/** Lời mời kết nối Google Drive; submit `connectGoogleDrive` rồi quay lại đúng trang hiện tại. */
export function DriveConnectPrompt({ title = DEFAULT_TITLE, description = DEFAULT_DESCRIPTION }: DriveConnectPromptProps) {
  const pathname = usePathname();
  const redirectTo = currentLocation(pathname, useSearchParams().toString());
  return (
    <div className={blockClass}>
      <HardDrive className="mb-3 h-8 w-8 text-brand" aria-hidden />
      <p className="text-sm font-medium">{title}</p>
      <p className="mb-5 mt-2 max-w-sm text-sm leading-6 text-muted">{description}</p>
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
