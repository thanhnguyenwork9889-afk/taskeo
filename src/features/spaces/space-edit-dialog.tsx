"use client";

import { useState, type FormEvent } from "react";
import { useUI } from "@/components/layout/ui-context";
import { Modal } from "@/components/ui/modal";
import { SpaceStylePicker, type SpaceStyle } from "@/components/ui/space-style-picker";
import type { Space } from "@/domain/types";
import { SPACE_DESCRIPTION_MAX, SPACE_NAME_MAX, updateSpaceInputSchema } from "@/domain/validation";
import { updateSpace, type SpaceChanges } from "@/domain/workspace-actions";
import { updateWorkspace } from "@/store/workspace-store";
import { control, cx, field, primaryButton } from "@/components/ui/styles";

type FieldErrors = Partial<Record<"name" | "description" | "form", string>>;

interface Draft extends SpaceStyle {
  name: string;
  description: string;
}

/** Luôn gửi tên (bắt buộc); các trường khác chỉ gửi khi đổi, như một PATCH. */
function changesFrom(space: Space, draft: Draft): SpaceChanges {
  const changes: SpaceChanges = { name: draft.name };
  if (draft.description.trim() !== space.description) changes.description = draft.description;
  if (draft.color !== space.color) changes.color = draft.color;
  if (draft.icon !== space.icon) changes.icon = draft.icon;
  return changes;
}

function validate(changes: SpaceChanges): { data: SpaceChanges } | { errors: FieldErrors } {
  const parsed = updateSpaceInputSchema.safeParse(changes);
  if (parsed.success) return { data: parsed.data };
  const errors: FieldErrors = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0] === "name" || issue.path[0] === "description" ? issue.path[0] : "form";
    errors[key] ??= issue.message;
  }
  return { errors };
}

/** Sửa tên, mô tả, màu, biểu tượng của không gian. */
export function SpaceEditDialog({ space, onClose }: { space: Space; onClose: () => void }) {
  const { notify } = useUI();
  const [draft, setDraft] = useState<Draft>({ name: space.name, description: space.description, color: space.color, icon: space.icon });
  const [errors, setErrors] = useState<FieldErrors>({});

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = validate(changesFrom(space, draft));
    if ("errors" in result) {
      setErrors(result.errors);
      return;
    }
    updateWorkspace((s) => updateSpace(s, space.id, result.data));
    notify("Đã lưu thay đổi không gian.");
    onClose();
  };

  const edit = (next: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...next }));
    setErrors({});
  };

  return (
    <Modal title="Sửa không gian" onClose={onClose} size="lg">
      <form onSubmit={submit} noValidate className="space-y-4">
        <NameField value={draft.name} error={errors.name} onChange={(name) => edit({ name })} />
        <DescriptionField value={draft.description} error={errors.description} onChange={(description) => edit({ description })} />
        <SpaceStylePicker color={draft.color} icon={draft.icon} onChange={(style) => edit(style)} />
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
      <label htmlFor="space-edit-name" className="block text-sm font-medium">
        Tên không gian <span aria-hidden className="text-red-700">*</span>
      </label>
      <input
        id="space-edit-name"
        required
        maxLength={SPACE_NAME_MAX}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? "space-edit-name-error" : undefined}
        className={cx(field, "mt-2")}
      />
      {error && (
        <p id="space-edit-name-error" role="alert" className="mt-1.5 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

function DescriptionField({ value, error, onChange }: FieldProps) {
  return (
    <div>
      <label htmlFor="space-edit-description" className="block text-sm font-medium">
        Mô tả
      </label>
      <textarea
        id="space-edit-description"
        rows={3}
        maxLength={SPACE_DESCRIPTION_MAX}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={cx("space-edit-description-count", error && "space-edit-description-error")}
        className={cx(field, "mt-2 py-2")}
      />
      <p id="space-edit-description-count" className="mt-1 text-right text-xs text-muted">
        {value.trim().length}/{SPACE_DESCRIPTION_MAX}
      </p>
      {error && (
        <p id="space-edit-description-error" role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
