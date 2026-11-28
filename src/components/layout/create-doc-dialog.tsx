"use client";

import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Modal } from "@/components/ui/modal";
import type { DocKind } from "@/domain/types";
import { SPACE_NAME_MAX } from "@/domain/validation";
import { control, cx, field, primaryButton, secondaryButton } from "@/components/ui/styles";
import { buildCreateFileBody, postDriveFile, type CreateFileBody, type CreateFileFormValues, type NamedOption } from "./create-doc-api";
import { createDocDialogState, type CreateDocDialogState } from "./create-doc-state";
import { DocKindField } from "./doc-kind-field";
import { DriveConnectPrompt } from "./drive-connect-prompt";
import { DrivePlacementFields, LoadingSkeleton, SpacesError, placementStatusClass } from "./drive-placement-fields";
import { useViewer, type CreateRequest } from "./ui-context";
import { useApiSpaces } from "./use-create-doc-data";
import { useCreateDocSubmit, type CreatedFile, type CreateFileMutation } from "./use-create-doc-submit";
import { useDrivePlacement } from "./use-drive-placement";

// Hộp thoại tạo Doc / Sheet / Slide trong thư mục Drive (T017, chế độ configured). Không gian / dự án
// lấy từ API vì ID store demo chưa khớp DB (T59). Component gọi `useViewer()` → phải nằm trong <Suspense>.

type DocRequest = Extract<CreateRequest, { kind: "doc" }>;

const TITLE = "Tạo tài liệu mới";
const cancelClass = cx(control, "border border-[#E5E3ED] px-4 text-sm disabled:cursor-not-allowed disabled:opacity-60");

interface DriveCreateDocDialogProps {
  request: DocRequest;
  onClose: () => void;
}

export function DriveCreateDocDialog({ request, onClose }: DriveCreateDocDialogProps) {
  const { driveConnected } = useViewer();
  const spacesQuery = useApiSpaces({ enabled: driveConnected });
  // Bọc lại: TanStack truyền context làm tham số thứ hai, không được lọt vào `options` của `postDriveFile`.
  const mutation = useMutation({ mutationFn: (body: CreateFileBody) => postDriveFile(body) });
  const spaces = spacesQuery.data ?? [];
  const state = createDocDialogState({ driveConnected, spacesStatus: spacesQuery.status, spaceCount: spaces.length });
  const busy = mutation.isPending;
  // Modal / Hủy: không đóng khi đang gửi. Sau khi tạo xong dùng `onClose` gốc.
  const close = () => {
    if (!busy) onClose();
  };

  return (
    <Modal title={TITLE} onClose={close} dismissible={!busy}>
      {state === "ready" ? (
        <CreateDocForm request={request} spaces={spaces} mutation={mutation} onCancel={close} onDone={onClose} />
      ) : (
        <DialogStatus state={state} retrying={spacesQuery.isFetching} onRetry={() => void spacesQuery.refetch()} onClose={close} />
      )}
    </Modal>
  );
}

interface DialogStatusProps {
  state: Exclude<CreateDocDialogState, "ready">;
  retrying: boolean;
  onRetry: () => void;
  onClose: () => void;
}

/** Các trạng thái trước khi có form: mời kết nối Drive, đang tải, lỗi tải không gian, chưa có không gian. */
function DialogStatus({ state, retrying, onRetry, onClose }: DialogStatusProps) {
  if (state === "connect") {
    return (
      <DriveConnectPrompt
        title="Kết nối Google Drive để tạo tài liệu"
        description="Tài liệu mới được tạo trong thư mục Taskeo trên Google Drive của bạn. Taskeo chỉ xin quyền với các file do Taskeo tạo hoặc bạn mở bằng Taskeo."
      />
    );
  }
  if (state === "loading") return <LoadingSkeleton />;
  if (state === "error") return <SpacesError retrying={retrying} onRetry={onRetry} />;
  return (
    <div className={placementStatusClass}>
      <p className="text-sm font-medium">Bạn chưa có không gian nào</p>
      <p className="mb-5 mt-2 max-w-sm text-sm leading-6 text-muted">
        Tài liệu được lưu trong thư mục Drive của một không gian. Hãy tạo không gian trước, rồi quay lại tạo tài liệu.
      </p>
      <button type="button" onClick={onClose} className={secondaryButton}>
        Đóng
      </button>
    </div>
  );
}

/** State của form: tên, loại, và chỗ đặt (không gian / dự án) từ `useDrivePlacement`. */
function useDocForm(request: DocRequest, spaces: NamedOption[]) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<DocKind>(request.docKind ?? "doc");
  const placement = useDrivePlacement(request, spaces);
  const values: CreateFileFormValues = { name, kind, spaceId: placement.spaceId, projectId: placement.projectId };
  return { values, placement, setName, setKind };
}

interface CreateDocFormProps {
  request: DocRequest;
  spaces: NamedOption[];
  mutation: CreateFileMutation;
  /** Hủy: bản có kiểm `busy`. */
  onCancel: () => void;
  /** Đã tạo xong: `onClose` gốc. */
  onDone: () => void;
}

function CreateDocForm({ request, spaces, mutation, onCancel, onDone }: CreateDocFormProps) {
  const form = useDocForm(request, spaces);
  const { values } = form;
  const { projectWait } = form.placement;
  const { submit, error, created } = useCreateDocSubmit({ mutation, onDone });
  const busy = mutation.isPending;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const body = buildCreateFileBody(values);
    if (!body.name || busy || projectWait) return;
    // Gọi đồng bộ trong sự kiện: `submit` mở tab chờ trước mọi `await`.
    void submit(body);
  };

  if (created) return <CreatedNotice file={created} onClose={onDone} />;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <DocKindField value={values.kind} onChange={form.setKind} disabled={busy} />
      <NameField value={values.name} onChange={form.setName} disabled={busy} />
      <DrivePlacementFields spaces={spaces} placement={form.placement} disabled={busy} />
      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-800">
          {error}
        </p>
      )}
      <FormActions busy={busy} blocked={projectWait !== null} onCancel={onCancel} />
    </form>
  );
}

interface TextFieldProps {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}

function NameField({ value, onChange, disabled }: TextFieldProps) {
  return (
    <label className="block text-sm font-medium">
      Tên
      <input
        required
        autoFocus
        maxLength={SPACE_NAME_MAX}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Ví dụ: Kế hoạch quý"
        className={cx(field, "mt-2 disabled:opacity-60")}
      />
    </label>
  );
}

interface FormActionsProps {
  busy: boolean;
  /** Đang chờ / lỗi tải dự án được yêu cầu: không cho gửi. */
  blocked: boolean;
  onCancel: () => void;
}

function FormActions({ busy, blocked, onCancel }: FormActionsProps) {
  return (
    <div className="flex justify-end gap-3">
      <button type="button" onClick={onCancel} disabled={busy} className={cancelClass}>
        Hủy
      </button>
      <button type="submit" disabled={busy || blocked} className={cx(primaryButton, "disabled:opacity-60", busy ? "disabled:cursor-wait" : "disabled:cursor-not-allowed")}>
        {busy ? "Đang tạo…" : "Tạo mới"}
      </button>
    </div>
  );
}

/** Đã tạo nhưng không mở được tab (popup bị chặn) hoặc không có liên kết: giữ hộp thoại, hiện liên kết nếu có. */
function CreatedNotice({ file, onClose }: { file: CreatedFile; onClose: () => void }) {
  return (
    <div role="status" className="space-y-4">
      <p className="text-sm leading-6">
        Đã tạo <span className="font-medium">{file.name}</span>.
        {file.url ? " Trình duyệt đã chặn tab mới, hãy mở tài liệu bằng liên kết dưới đây." : " Tài liệu đã có trong danh sách tài liệu."}
      </p>
      <div className="flex items-center justify-end gap-3">
        {file.url && (
          <a href={file.url} target="_blank" rel="noopener noreferrer" className={secondaryButton}>
            Mở tài liệu
          </a>
        )}
        <button type="button" onClick={onClose} className={primaryButton}>
          Đóng
        </button>
      </div>
    </div>
  );
}
