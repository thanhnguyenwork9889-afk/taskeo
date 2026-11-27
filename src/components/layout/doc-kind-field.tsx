"use client";

import { DOC_KIND_LABEL, DOC_KINDS } from "@/domain/labels";
import type { DocKind } from "@/domain/types";
import { cx, field } from "@/components/ui/styles";

// Ô chọn loại tài liệu, dùng chung cho form store (demo) và hộp thoại tạo file Drive (T017).

interface DocKindFieldProps {
  value: DocKind;
  onChange: (kind: DocKind) => void;
  disabled?: boolean;
}

export function DocKindField({ value, onChange, disabled = false }: DocKindFieldProps) {
  return (
    <label className="block text-sm font-medium">
      Loại tài liệu
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as DocKind)}
        className={cx(field, "mt-2 disabled:opacity-60")}
      >
        {DOC_KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {DOC_KIND_LABEL[kind]}
          </option>
        ))}
      </select>
    </label>
  );
}
