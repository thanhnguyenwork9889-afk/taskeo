"use client";

import { useState, type FormEvent } from "react";
import { useUI } from "@/components/layout/ui-context";
import { Modal } from "@/components/ui/modal";
import type { Project, WorkspaceState } from "@/domain/types";
import { PROJECT_DESCRIPTION_MAX, PROJECT_NAME_MAX, updateProjectInputSchema } from "@/domain/validation";
import { projectNameExists, updateProject, type ProjectChanges } from "@/domain/workspace-actions";
import { updateWorkspace, useWorkspace } from "@/store/workspace-store";
import { control, cx, field, primaryButton } from "@/components/ui/styles";

type FieldErrors = Partial<Record<"name" | "description" | "form", string>>;

interface Draft {
  name: string;
  description: string;
}

const DUPLICATE_NAME = "Tên dự án đã tồn tại trong không gian này.";

/** Luôn gửi tên (bắt buộc); mô tả chỉ gửi khi đổi, như một PATCH. */
function changesFrom(project: Project, draft: Draft): ProjectChanges {
  const changes: ProjectChanges = { name: draft.name };
  if (draft.description.trim() !== project.description) changes.description = draft.description;
  return changes;
}

function validate(state: WorkspaceState, project: Project, changes: ProjectChanges): { data: ProjectChanges } | { errors: FieldErrors } {
  const parsed = updateProjectInputSchema.safeParse(changes);
  if (!parsed.success) {
    const errors: FieldErrors = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] === "name" || issue.path[0] === "description" ? issue.path[0] : "form";
      errors[key] ??= issue.message;
    }
    return { errors };
  }
  const name = parsed.data.name ?? project.name;
  if (projectNameExists(state, project.spaceId, name, project.id)) return { errors: { name: DUPLICATE_NAME } };
  return { data: { name, description: parsed.data.description } };
}

/** Sửa tên và mô tả của dự án. */
export function ProjectEditDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const state = useWorkspace();
  const { notify } = useUI();
  const [draft, setDraft] = useState<Draft>({ name: project.name, description: project.description });
  const [errors, setErrors] = useState<FieldErrors>({});

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = validate(state, project, changesFrom(project, draft));
    if ("errors" in result) {
      setErrors(result.errors);
      return;
    }
    updateWorkspace((s) => updateProject(s, project.id, result.data));
    notify("Đã lưu thay đổi dự án.");
    onClose();
  };

  const edit = (next: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...next }));
    setErrors({});
  };

  return (
    <Modal title="Sửa dự án" onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <NameField value={draft.name} error={errors.name} onChange={(name) => edit({ name })} />
        <DescriptionField value={draft.description} error={errors.description} onChange={(description) => edit({ description })} />
        {errors.form && (
          <p role="alert" className="text-sm text-red-700">
            {errors.form}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className={cx(control, "border border-[#E5DFED] px-4 text-sm")}>
            Hủy
          </button>
          <button type="submit" className={primaryButton}>
            Lưu
          </button>
        </div>
      </form>
    </Modal>
  );
}

interface FieldProps {
  value: string;
  error?: string;
  onChange: (value: string) => void;
}

function NameField({ value, error, onChange }: FieldProps) {
  return (
    <div>
      <label htmlFor="project-edit-name" className="block text-sm font-medium">
        Tên dự án <span aria-hidden className="text-red-700">*</span>
      </label>
      <input
        id="project-edit-name"
        required
        maxLength={PROJECT_NAME_MAX}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? "project-edit-name-error" : undefined}
        className={cx(field, "mt-2")}
      />
      {error && (
        <p id="project-edit-name-error" role="alert" className="mt-1.5 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

function DescriptionField({ value, error, onChange }: FieldProps) {
  return (
    <div>
      <label htmlFor="project-edit-description" className="block text-sm font-medium">
        Mô tả
      </label>
      <textarea
        id="project-edit-description"
        rows={3}
        maxLength={PROJECT_DESCRIPTION_MAX}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={cx("project-edit-description-count", error && "project-edit-description-error")}
        className={cx(field, "mt-2 py-2")}
      />
      <p id="project-edit-description-count" className="mt-1 text-right text-xs text-muted">
        {value.trim().length}/{PROJECT_DESCRIPTION_MAX}
      </p>
      {error && (
        <p id="project-edit-description-error" role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
