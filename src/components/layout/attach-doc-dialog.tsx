"use client";

import type { FormEvent } from "react";
import { HardDrive } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { control, cx, primaryButton, secondaryButton } from "@/components/ui/styles";
import {
  attachButtonLabel,
  attachDialogState,
  canDismissAttach,
  isAttachBusy,
  type AttachDialogState,
  type AttachPhase,
} from "./attach-doc-state";
import type { NamedOption } from "./create-doc-api";
import { DriveConnectPrompt } from "./drive-connect-prompt";
import { DrivePlacementFields, LoadingSkeleton, SpacesError, placementStatusClass } from "./drive-placement-fields";
import { useViewer, type CreateRequest } from "./ui-context";
import { useAttachDoc, type AttachTarget } from "./use-attach-doc";
import { useApiSpaces } from "./use-create-doc-data";
import { useDrivePlacement } from "./use-drive-placement";

// Hộp thoại "Gắn file từ Drive" (T018, chế độ configured): chọn không gian / dự án từ API, mở Google Picker,
// tạo lối tắt Drive tới file đã chọn. Component gọi `useViewer()` → phải nằm trong <Suspense>.

type AttachRequest = Extract<CreateRequest, { kind: "attach" }>;

const TITLE = "Gắn file từ Drive";
const cancelClass = cx(control, "border border-[#E5E3ED] px-4 text-sm disabled:cursor-not-allowed disabled:opacity-60");

interface DriveAttachDocDialogProps {
  request: AttachRequest;
  onClose: () => void;
}

export function DriveAttachDocDialog({ request, onClose }: DriveAttachDocDialogProps) {
  const { driveConnected } = useViewer();
  const spacesQuery = useApiSpaces({ enabled: driveConnected });
  const spaces = spacesQuery.data ?? [];
  const state = attachDialogState({ driveConnected, spacesStatus: spacesQuery.status, spaceCount: spaces.length });
  const { phase, error, choose, cancel } = useAttachDoc({ onDone: onClose });
  const dismissible = canDismissAttach(phase);
  // Picker đang mở (iframe đè lên Modal) / đang gửi → không cho Esc / bấm ngoài / Hủy đóng hộp thoại.
  // Đang nạp script / lấy token → đóng được: hủy lượt trước rồi đóng.
  const close = () => {
    if (!dismissible) return;
    cancel();
    onClose();
  };

  return (
    <Modal title={TITLE} onClose={close} dismissible={dismissible}>
      {state === "ready" ? (
        <AttachForm request={request} spaces={spaces} phase={phase} error={error} onChoose={choose} onCancel={close} />
      ) : (
        <DialogStatus state={state} retrying={spacesQuery.isFetching} onRetry={() => void spacesQuery.refetch()} onClose={close} />
      )}
    </Modal>
  );
}

interface DialogStatusProps {
  state: Exclude<AttachDialogState, "ready">;
  retrying: boolean;
  onRetry: () => void;
  onClose: () => void;
}

/** Trước khi có form: mời kết nối Drive (không gọi API), đang tải, lỗi tải không gian, chưa có không gian. */
function DialogStatus({ state, retrying, onRetry, onClose }: DialogStatusProps) {
  if (state === "connect") {
    return (
      <DriveConnectPrompt
        title="Kết nối Google Drive để gắn file"
        description="Taskeo cần quyền Google Drive để tạo lối tắt tới file bạn chọn trong thư mục Taskeo. Taskeo chỉ xin quyền với các file do Taskeo tạo hoặc bạn mở bằng Taskeo."
      />
    );
  }
  if (state === "loading") return <LoadingSkeleton />;
  if (state === "error") return <SpacesError retrying={retrying} onRetry={onRetry} />;
  return (
    <div className={placementStatusClass}>
      <p className="text-sm font-medium">Bạn chưa có không gian nào</p>
      <p className="mb-5 mt-2 max-w-sm text-sm leading-6 text-muted">
        File được gắn vào thư mục Drive của một không gian. Hãy tạo không gian trước, rồi quay lại gắn file.
      </p>
      <button type="button" onClick={onClose} className={secondaryButton}>
        Đóng
      </button>
    </div>
  );
}

interface AttachFormProps {
  request: AttachRequest;
  spaces: NamedOption[];
  phase: AttachPhase;
  error: string | null;
  onChoose: (target: AttachTarget) => void;
  /** Hủy: bản có kiểm `canDismissAttach`. */
  onCancel: () => void;
}

function AttachForm({ request, spaces, phase, error, onChoose, onCancel }: AttachFormProps) {
  const placement = useDrivePlacement(request, spaces);
  const busy = isAttachBusy(phase);
  const blocked = placement.projectWait !== null || !placement.spaceId;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (busy || blocked) return;
    onChoose({ spaceId: placement.spaceId, projectId: placement.projectId });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <DrivePlacementFields spaces={spaces} placement={placement} disabled={busy} />
      <p className="text-xs leading-5 text-muted">
        Taskeo tạo một lối tắt tới file trong thư mục của dự án (hoặc không gian) trên Google Drive. File gốc giữ nguyên
        chỗ cũ, Taskeo không đổi quyền chia sẻ.
      </p>
      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-800">
          {error}
        </p>
      )}
      <FormActions phase={phase} blocked={blocked} onCancel={onCancel} />
    </form>
  );
}

interface FormActionsProps {
  phase: AttachPhase;
  /** Chưa có không gian / đang chờ / lỗi tải dự án được yêu cầu: không cho mở Picker. */
  blocked: boolean;
  onCancel: () => void;
}

function FormActions({ phase, blocked, onCancel }: FormActionsProps) {
  const busy = isAttachBusy(phase);
  return (
    <div className="flex justify-end gap-3">
      <button type="button" onClick={onCancel} disabled={!canDismissAttach(phase)} className={cancelClass}>
        Hủy
      </button>
      <button
        type="submit"
        disabled={busy || blocked}
        aria-busy={busy}
        className={cx(primaryButton, "disabled:opacity-60", busy ? "disabled:cursor-wait" : "disabled:cursor-not-allowed")}
      >
        <HardDrive className="h-4 w-4" aria-hidden />
        {attachButtonLabel(phase)}
      </button>
    </div>
  );
}
