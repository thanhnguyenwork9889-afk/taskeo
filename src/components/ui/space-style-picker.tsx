"use client";

import { useId } from "react";
import { SPACE_ICONS, SPACE_ICON_LABEL, SPACE_PALETTE, tintForColor } from "@/domain/labels";
import type { SpaceIcon as SpaceIconId } from "@/domain/types";
import { SpaceIcon } from "@/components/ui/space-icon";
import { cx } from "@/components/ui/styles";

export interface SpaceStyle {
  color: string;
  icon: SpaceIconId;
}

interface SpaceStylePickerProps extends SpaceStyle {
  onChange: (next: SpaceStyle) => void;
}

const legend = "mb-2 text-sm font-medium text-ink";
/** Ô lựa chọn 44px; vòng focus hiện khi input radio (sr-only) bên trong được focus bằng bàn phím. */
const option =
  "relative flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand has-[:focus-visible]:ring-offset-2";

/** Chọn màu + biểu tượng cho không gian: hai nhóm radio thật, đi bằng phím mũi tên. */
export function SpaceStylePicker({ color, icon, onChange }: SpaceStylePickerProps) {
  const name = useId();
  return (
    <div className="space-y-4">
      <ColorGroup name={`${name}-color`} color={color} onSelect={(next) => onChange({ color: next, icon })} />
      <IconGroup
        name={`${name}-icon`}
        color={color}
        icon={icon}
        onSelect={(next) => onChange({ color, icon: next })}
      />
    </div>
  );
}

function ColorGroup({ name, color, onSelect }: { name: string; color: string; onSelect: (color: string) => void }) {
  return (
    <fieldset>
      <legend className={legend}>Màu</legend>
      <div className="flex flex-wrap gap-1">
        {SPACE_PALETTE.map((entry) => {
          const checked = entry.color.toLowerCase() === color.toLowerCase();
          return (
            <label key={entry.color} className={option} title={entry.label}>
              <input
                type="radio"
                name={name}
                value={entry.color}
                checked={checked}
                onChange={() => onSelect(entry.color)}
                aria-label={entry.label}
                className="sr-only"
              />
              <span
                className={cx("h-7 w-7 rounded-full", checked && "ring-2 ring-offset-2 ring-ink")}
                style={{ backgroundColor: entry.color }}
                aria-hidden
              />
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

interface IconGroupProps {
  name: string;
  color: string;
  icon: SpaceIconId;
  onSelect: (icon: SpaceIconId) => void;
}

function IconGroup({ name, color, icon, onSelect }: IconGroupProps) {
  const tint = tintForColor(color);
  return (
    <fieldset>
      <legend className={legend}>Biểu tượng</legend>
      <div className="flex flex-wrap gap-1">
        {SPACE_ICONS.map((id) => {
          const checked = id === icon;
          return (
            <label
              key={id}
              className={cx(option, "border", checked ? "border-current" : "border-transparent hover:bg-brand-faint")}
              style={checked ? { backgroundColor: tint, color } : undefined}
              title={SPACE_ICON_LABEL[id]}
            >
              <input
                type="radio"
                name={name}
                value={id}
                checked={checked}
                onChange={() => onSelect(id)}
                aria-label={SPACE_ICON_LABEL[id]}
                className="sr-only"
              />
              <SpaceIcon icon={id} className={cx("h-5 w-5", !checked && "text-muted")} />
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
