"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import type { DocKind, DriveFileItem } from "@/domain/types";
import { SPACE_NAME_MAX } from "@/domain/validation";
import { control, cx, field, primaryButton, secondaryButton } from "@/components/ui/styles";
import { buildCreateFileBody, postDriveFile, type CreateFileBody, type CreateFileFormValues, type NamedOption } from "./create-doc-api";
import { createDocDialogState, createDocErrorMessage, initialProjectId, initialSpaceId, type CreateDocDialogState } from "./create-doc-state";
import { DocKindField } from "./doc-kind-field";
import { DriveConnectPrompt } from "./drive-connect-prompt";
import { closePendingTab, finishPendingTab, openPendingTab } from "./pending-tab";
import { DRIVE_FILES_QUERY_KEY } from "./query-keys";
import { useUI, useViewer, type CreateRequest } from "./ui-context";
import { useApiProjects, useApiSpaces } from "./use-create-doc-data";

// Hộp thoại tạo Doc / Sheet / Slide trong thư mục Drive (T017, chế độ configured). Không gian / dự án
// lấy từ API vì ID store demo chưa khớp DB (T59). Component gọi `useViewer()` → phải nằm trong <Suspense>.

type DocRequest = Extract<CreateRequest, { kind: "doc" }>;
type CreateFileMutation = UseMutationResult<DriveFileItem, Error, CreateFileBody>;

const TITLE = "Tạo tài liệu mới";
const statusClass = "flex flex-col items-center px-2 py-6 text-center";
const cancelClass = cx(control, "border border-[#E5E3ED] px-4 text-sm disabled:cursor-not-allowed disabled:opacity-60");

interface DriveCreateDocDialogProps {
  request: DocRequest;
  onClose: () => void;
}

export function DriveCreateDocDialog({ request, onClose }: DriveCreateDocDialogProps) {
  const { driveConnected } = useViewer();
  const spacesQuery = useApiSpaces({ enabled: driveConnected });
  const mutation = useMutation({ mutationFn: postDriveFile });
  const spaces = spacesQuery.data ?? [];
  const state = createDocDialogState({ driveConnected, spacesStatus: spacesQuery.status, spaceCount: spaces.length });
  const busy = mutation.isPending;
  const close = () => {
    if (!busy) onClose();
  };

  return (
    <Modal title={TITLE} onClose={close} dismissible={!busy}>
      {state === "ready" ? (
        <CreateDocForm request={request} spaces={spaces} mutation={mutation} onClose={close} />
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
    <div className={statusClass}>
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

function LoadingSkeleton() {
  return (
    <div role="status" aria-label="Đang tải danh sách không gian" className="space-y-5">
      {[0, 1, 2, 3].map((index) => (
        <div key={index} aria-hidden className="space-y-2">
          <span className="block h-3 w-24 animate-pulse rounded bg-brand-faint" />
          <span className="block h-11 w-full animate-pulse rounded-lg bg-brand-faint" />
        </div>
      ))}
    </div>
  );
}

function SpacesError({ retrying, onRetry }: { retrying: boolean; onRetry: () => void }) {
  return (
    <div role="alert" className={statusClass}>
      <AlertTriangle className="mb-3 h-8 w-8 text-red-700" aria-hidden />
      <p className="text-sm font-medium">Không tải được danh sách không gian</p>
      <p className="mb-5 mt-2 max-w-sm text-sm leading-6 text-muted">Kiểm tra kết nối mạng rồi thử lại.</p>
      <button type="button" onClick={onRetry} disabled={retrying} className={cx(secondaryButton, "disabled:cursor-wait disabled:opacity-60")}>
        <RotateCw className={cx("h-4 w-4", retrying && "animate-spin")} aria-hidden />
        {retrying ? "Đang thử lại…" : "Thử lại"}
      </button>
    </div>
  );
}

interface CreatedFile {
  name: string;
  /** `null` = không có liên kết hợp lệ để mở. */
  url: string | null;
}

/**
 * State của form. Dự án: `projectChoice === null` = người dùng chưa chọn → dùng `initialProjectId` khi danh sách
 * dự án của không gian ban đầu đã tải; đổi không gian → reset về "Không gắn dự án".
 */
function useDocForm(request: DocRequest, spaces: NamedOption[]) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<DocKind>(request.docKind ?? "doc");
  const [startSpaceId] = useState(() => initialSpaceId(request.spaceId, spaces));
  const [spaceId, setSpaceId] = useState(startSpaceId);
  const [projectChoice, setProjectChoice] = useState<string | null>(null);
  const projectsQuery = useApiProjects(spaceId, { enabled: true });
  const projects = projectsQuery.data ?? [];
  const defaultProjectId = spaceId === startSpaceId ? initialProjectId(request.projectId, projects) : "";
  const values: CreateFileFormValues = { name, kind, spaceId, projectId: projectChoice ?? defaultProjectId };
  const changeSpace = (id: string) => {
    setSpaceId(id);
    setProjectChoice("");
  };
  return { values, projects, projectsQuery, setName, setKind, changeSpace, setProjectId: setProjectChoice };
}

interface CreateDocFormProps {
  request: DocRequest;
  spaces: NamedOption[];
  mutation: CreateFileMutation;
  onClose: () => void;
}

function CreateDocForm({ request, spaces, mutation, onClose }: CreateDocFormProps) {
  const form = useDocForm(request, spaces);
  const { values, projectsQuery } = form;
  const { notify } = useUI();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedFile | null>(null);
  const busy = mutation.isPending;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const body = buildCreateFileBody(values);
    if (!body.name || busy) return;
    setError(null);
    // Mở tab ĐỒNG BỘ trong sự kiện submit, trước mọi `await`, để trình duyệt không chặn popup.
    const tab = openPendingTab(window.open.bind(window));
    let file: DriveFileItem;
    try {
      file = await mutation.mutateAsync(body);
    } catch (caught) {
      closePendingTab(tab);
      setError(createDocErrorMessage(caught));
      return;
    }
    void queryClient.invalidateQueries({ queryKey: DRIVE_FILES_QUERY_KEY });
    const outcome = finishPendingTab(tab, file.url);
    if (outcome === "opened") {
      notify(`Đã tạo ${file.name}`);
      onClose();
      return;
    }
    setCreated({ name: file.name, url: outcome === "blocked" ? file.url : null });
  };

  if (created) return <CreatedNotice file={created} onClose={onClose} />;

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-5">
      <DocKindField value={values.kind} onChange={form.setKind} disabled={busy} />
      <NameField value={values.name} onChange={form.setName} disabled={busy} />
      <SpaceSelect spaces={spaces} value={values.spaceId} onChange={form.changeSpace} disabled={busy} />
      <ProjectSelect
        projects={form.projects}
        value={values.projectId}
        onChange={form.setProjectId}
        loading={projectsQuery.isPending}
        failed={projectsQuery.isError}
        disabled={busy}
      />
      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-800">
          {error}
        </p>
      )}
      <FormActions busy={busy} onCancel={onClose} />
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

interface SpaceSelectProps extends TextFieldProps {
  spaces: NamedOption[];
}

function SpaceSelect({ spaces, value, onChange, disabled }: SpaceSelectProps) {
  return (
    <label className="block text-sm font-medium">
      Không gian
      <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={cx(field, "mt-2 disabled:opacity-60")}>
        {spaces.map((space) => (
          <option key={space.id} value={space.id}>
            {space.name}
          </option>
        ))}
      </select>
    </label>
  );
}

interface ProjectSelectProps extends TextFieldProps {
  projects: NamedOption[];
  loading: boolean;
  failed: boolean;
}

function ProjectSelect({ projects, value, onChange, loading, failed, disabled }: ProjectSelectProps) {
  return (
    <label className="block text-sm font-medium">
      Dự án
      <select
        value={value}
        disabled={disabled || loading}
        aria-busy={loading}
        onChange={(event) => onChange(event.target.value)}
        className={cx(field, "mt-2 disabled:opacity-60")}
      >
        <option value="">{loading ? "Đang tải dự án…" : "Không gắn dự án"}</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
      {failed && <span className="mt-1 block text-xs font-normal text-muted">Không tải được danh sách dự án; tài liệu sẽ nằm trong thư mục không gian.</span>}
    </label>
  );
}

function FormActions({ busy, onCancel }: { busy: boolean; onCancel: () => void }) {
  return (
    <div className="flex justify-end gap-3">
      <button type="button" onClick={onCancel} disabled={busy} className={cancelClass}>
        Hủy
      </button>
      <button type="submit" disabled={busy} className={cx(primaryButton, "disabled:cursor-wait disabled:opacity-60")}>
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
