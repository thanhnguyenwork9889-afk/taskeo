"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { SpaceStylePicker, type SpaceStyle } from "@/components/ui/space-style-picker";
import { DEFAULT_SPACE_ICON, DOC_KIND_LABEL, DOC_KINDS, SPACE_PALETTE } from "@/domain/labels";
import type { DocKind, Project, Space, WorkspaceState } from "@/domain/types";
import { createFile, createProject, createSpace, createTask, projectNameExists } from "@/domain/workspace-actions";
import { updateWorkspace, useWorkspace } from "@/store/workspace-store";
import { control, cx, field, primaryButton } from "@/components/ui/styles";
import { useUI, type CreateRequest } from "./ui-context";

const TITLES: Record<CreateRequest["kind"], string> = {
  task: "Tạo công việc mới",
  space: "Tạo không gian mới",
  project: "Tạo dự án mới",
  doc: "Tạo tài liệu mới",
};

const NOTES: Record<CreateRequest["kind"], string> = {
  task: "Chế độ demo: công việc được lưu trên trình duyệt này.",
  space: "Giai đoạn 3 sẽ tự tạo thư mục Google Drive cho không gian.",
  project: "Giai đoạn 3 sẽ tạo thư mục con trên Drive cho dự án.",
  doc: "Chế độ demo: chưa tạo tệp trên Google Drive.",
};

const DESCRIPTION_MAX_LENGTH = 500;

interface FormValues {
  title: string;
  spaceId: string;
  projectId: string;
  docKind: DocKind;
  description: string;
  style: SpaceStyle;
}

type Recipe = (state: WorkspaceState) => WorkspaceState;
type Outcome = { recipe: Recipe } | { error: string };

/** Màu mặc định giống `createSpace` khi không truyền màu, để ô chọn hiện đúng màu sẽ được lưu. */
function defaultSpaceStyle(spaceCount: number): SpaceStyle {
  return { color: SPACE_PALETTE[spaceCount % SPACE_PALETTE.length].color, icon: DEFAULT_SPACE_ICON };
}

function recipeFor(kind: CreateRequest["kind"], values: FormValues, workspace: WorkspaceState, stamp: Date): Outcome {
  const { title, spaceId, docKind, description, style } = values;
  const projectId = values.projectId || null;
  if (kind === "space") {
    return { recipe: (s) => createSpace(s, { name: title, description, color: style.color, icon: style.icon }) };
  }
  if (!spaceId) return { error: "Hãy tạo một không gian trước." };
  if (kind === "project") {
    if (projectNameExists(workspace, spaceId, title)) return { error: "Tên dự án đã tồn tại trong không gian này." };
    return { recipe: (s) => createProject(s, spaceId, title, stamp) };
  }
  if (kind === "doc") {
    return { recipe: (s) => createFile(s, { name: title, kind: docKind, spaceId, projectId }, stamp) };
  }
  return { recipe: (s) => createTask(s, { title, spaceId, projectId, dueDate: null }, stamp) };
}

/** State của form; dự án được yêu cầu quyết định luôn không gian, để form hiện đúng nơi sẽ lưu. */
function useCreateForm(request: CreateRequest, spaces: Space[], projects: Project[]) {
  const requestedProject = "projectId" in request ? projects.find((p) => p.id === request.projectId) : undefined;
  const [title, setTitle] = useState("");
  const [spaceId, setSpaceId] = useState(requestedProject?.spaceId || ("spaceId" in request && request.spaceId) || spaces[0]?.id || "");
  const [projectId, setProjectId] = useState(requestedProject?.id ?? "");
  const [docKind, setDocKind] = useState<DocKind>((request.kind === "doc" && request.docKind) || "doc");
  const [description, setDescription] = useState("");
  const [style, setStyle] = useState<SpaceStyle>(() => defaultSpaceStyle(spaces.length));
  const values: FormValues = { title, spaceId, projectId, docKind, description, style };
  const changeSpace = (id: string) => {
    setSpaceId(id);
    setProjectId("");
  };
  return { values, setTitle, changeSpace, setProjectId, setDocKind, setDescription, setStyle };
}

export function CreateDialog({ request, onClose }: { request: CreateRequest; onClose: () => void }) {
  const workspace = useWorkspace();
  const { spaces, projects } = workspace;
  const { notify } = useUI();
  const router = useRouter();
  const form = useCreateForm(request, spaces, projects);
  const { values } = form;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!values.title.trim()) return;
    const outcome = recipeFor(request.kind, values, workspace, new Date());
    if ("error" in outcome) {
      notify(outcome.error);
      return;
    }
    updateWorkspace(outcome.recipe);
    notify("Đã tạo mới.");
    onClose();
    if (request.kind === "space") router.push("/spaces");
  };

  return (
    <Modal title={TITLES[request.kind]} onClose={onClose}>
      <form onSubmit={submit} className="space-y-5">
        <TitleField kind={request.kind} value={values.title} onChange={form.setTitle} />
        {request.kind === "space" && (
          <SpaceFields description={values.description} onDescriptionChange={form.setDescription} style={values.style} onStyleChange={form.setStyle} />
        )}
        {request.kind === "doc" && <DocKindField value={values.docKind} onChange={form.setDocKind} />}
        {request.kind !== "space" && (
          <PlacementFields
            spaces={spaces}
            projects={projects.filter((p) => p.spaceId === values.spaceId)}
            spaceId={values.spaceId}
            projectId={values.projectId}
            showProjectPicker={request.kind === "task" || request.kind === "doc"}
            onSpaceChange={form.changeSpace}
            onProjectChange={form.setProjectId}
          />
        )}
        <p className="text-xs leading-5 text-muted">{NOTES[request.kind]}</p>
        <DialogActions onCancel={onClose} />
      </form>
    </Modal>
  );
}

interface TitleFieldProps {
  kind: CreateRequest["kind"];
  value: string;
  onChange: (value: string) => void;
}

function TitleField({ kind, value, onChange }: TitleFieldProps) {
  return (
    <label className="block text-sm font-medium">
      Tên
      <input
        required
        maxLength={200}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={kind === "space" ? "Ví dụ: Dự án cá nhân" : "Bạn đang lên kế hoạch gì?"}
        className={cx(field, "mt-2")}
      />
    </label>
  );
}

interface SpaceFieldsProps {
  description: string;
  onDescriptionChange: (value: string) => void;
  style: SpaceStyle;
  onStyleChange: (next: SpaceStyle) => void;
}

function SpaceFields({ description, onDescriptionChange, style, onStyleChange }: SpaceFieldsProps) {
  return (
    <>
      <label className="block text-sm font-medium">
        Mô tả <span className="font-normal text-muted">(không bắt buộc)</span>
        <textarea
          rows={3}
          maxLength={DESCRIPTION_MAX_LENGTH}
          value={description}
          onChange={(event) => onDescriptionChange(event.target.value)}
          placeholder="Không gian này dùng để làm gì?"
          className={cx(field, "mt-2 py-2 leading-6")}
        />
      </label>
      <SpaceStylePicker color={style.color} icon={style.icon} onChange={onStyleChange} />
    </>
  );
}

function DocKindField({ value, onChange }: { value: DocKind; onChange: (kind: DocKind) => void }) {
  return (
    <label className="block text-sm font-medium">
      Loại tài liệu
      <select value={value} onChange={(event) => onChange(event.target.value as DocKind)} className={cx(field, "mt-2")}>
        {DOC_KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {DOC_KIND_LABEL[kind]}
          </option>
        ))}
      </select>
    </label>
  );
}

interface PlacementFieldsProps {
  spaces: Space[];
  projects: Project[];
  spaceId: string;
  projectId: string;
  showProjectPicker: boolean;
  onSpaceChange: (id: string) => void;
  onProjectChange: (id: string) => void;
}

function PlacementFields({ spaces, projects, spaceId, projectId, showProjectPicker, onSpaceChange, onProjectChange }: PlacementFieldsProps) {
  return (
    <>
      <label className="block text-sm font-medium">
        Không gian
        <select value={spaceId} onChange={(event) => onSpaceChange(event.target.value)} className={cx(field, "mt-2")}>
          {spaces.map((space) => (
            <option key={space.id} value={space.id}>
              {space.name}
            </option>
          ))}
        </select>
      </label>
      {showProjectPicker && (
        <label className="block text-sm font-medium">
          Dự án
          <select value={projectId} onChange={(event) => onProjectChange(event.target.value)} className={cx(field, "mt-2")}>
            <option value="">Không gắn dự án</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </>
  );
}

function DialogActions({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="flex justify-end gap-3">
      <button type="button" onClick={onCancel} className={cx(control, "border border-[#E5E3ED] px-4 text-sm")}>
        Hủy
      </button>
      <button type="submit" className={primaryButton}>
        Tạo mới
      </button>
    </div>
  );
}
