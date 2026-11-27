"use client";

import { useState } from "react";
import { createPortal, useFormStatus } from "react-dom";
import { usePathname, useSearchParams } from "next/navigation";
import { HardDrive } from "lucide-react";
import { connectGoogleDrive, disconnectGoogleDrive } from "@/server/auth/actions";
import { Modal } from "@/components/ui/modal";
import { control, cx, dangerButton, secondaryButton } from "@/components/ui/styles";
import { currentLocation } from "./drive-status";

interface DriveSwitchProps {
  connected: boolean;
}

/**
 * Công tắc Google Drive ở sidebar. Tắt → bật: submit `connectGoogleDrive` (xin quyền drive.file).
 * Bật → tắt: mở hộp xác nhận rồi submit `disconnectGoogleDrive` (thu hồi quyền ở Google).
 * Cả hai quay lại trang hiện tại qua `redirectTo`.
 */
export function DriveSwitch({ connected }: DriveSwitchProps) {
  const pathname = usePathname();
  const redirectTo = currentLocation(pathname, useSearchParams().toString());
  const [confirming, setConfirming] = useState(false);

  if (!connected) {
    return (
      <form action={connectGoogleDrive}>
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <ConnectSwitchButton />
      </form>
    );
  }

  return (
    <>
      <SwitchRow checked type="button" onClick={() => setConfirming(true)} />
      {confirming &&
        createPortal(
          // <aside> có translate-x nên phần tử fixed bên trong bị nhốt → đưa modal ra body.
          <DisconnectDialog redirectTo={redirectTo} onClose={() => setConfirming(false)} />,
          document.body,
        )}
    </>
  );
}

function ConnectSwitchButton() {
  const { pending } = useFormStatus();
  return <SwitchRow checked={false} type="submit" disabled={pending} statusLabel={pending ? "Đang chuyển tới Google…" : undefined} />;
}

interface SwitchRowProps {
  checked: boolean;
  type: "button" | "submit";
  disabled?: boolean;
  statusLabel?: string;
  onClick?: () => void;
}

/** Một hàng bấm được (≥ 44px): icon + "Google Drive" + trạng thái, công tắc ở bên phải. */
function SwitchRow({ checked, type, disabled, statusLabel, onClick }: SwitchRowProps) {
  return (
    <button
      type={type}
      role="switch"
      aria-checked={checked}
      aria-label="Google Drive"
      disabled={disabled}
      onClick={onClick}
      className={cx(control, "flex w-full items-center gap-3 px-2 text-left hover:bg-canvas disabled:cursor-wait disabled:opacity-60")}
    >
      <HardDrive className={cx("h-4 w-4 shrink-0", checked ? "text-brand" : "text-[#737380]")} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-[#3F3F4A]">Google Drive</span>
        <span className="block text-xs text-[#737380]">{statusLabel ?? (checked ? "Đã kết nối" : "Chưa kết nối")}</span>
      </span>
      <span
        aria-hidden
        className={cx(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
          checked ? "bg-brand" : "bg-[#D4D4DC]",
        )}
      >
        <span
          className={cx(
            "inline-block h-5 w-5 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-[22px]" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}

function DisconnectDialog({ redirectTo, onClose }: { redirectTo: string; onClose: () => void }) {
  return (
    <Modal title="Ngắt kết nối Google Drive?" onClose={onClose}>
      <div className="space-y-3 text-sm text-[#55555F]">
        <p>
          Taskeo sẽ thu hồi <strong>mọi quyền Google</strong> đã cấp trên tài khoản này (Google Drive, và Google Calendar khi có),
          trên mọi thiết bị.
        </p>
        <p>Bạn vẫn đăng nhập Taskeo. Khi bật lại, bạn sẽ phải đồng ý lại với Google.</p>
      </div>
      <form action={disconnectGoogleDrive} className="mt-6 flex justify-end gap-2">
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <button type="button" onClick={onClose} className={secondaryButton}>
          Huỷ
        </button>
        <ConfirmDisconnectButton />
      </form>
    </Modal>
  );
}

function ConfirmDisconnectButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={cx(dangerButton, "disabled:cursor-wait disabled:opacity-60")}>
      {pending ? "Đang ngắt kết nối…" : "Ngắt kết nối"}
    </button>
  );
}
