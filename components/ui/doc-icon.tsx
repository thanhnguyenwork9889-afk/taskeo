import { FileSpreadsheet, FileText, Presentation, type LucideIcon } from "lucide-react";
import { DOC_KIND_STYLE } from "@/lib/labels";
import type { DocKind } from "@/lib/types";
import { cx } from "@/lib/ui";

export const DOC_ICON: Record<DocKind, LucideIcon> = {
  doc: FileText,
  sheet: FileSpreadsheet,
  slide: Presentation,
};

export function DocIcon({ kind, size = "md" }: { kind: DocKind; size?: "sm" | "md" }) {
  const Icon = DOC_ICON[kind];
  return (
    <span
      className={cx(
        "flex shrink-0 items-center justify-center rounded-lg",
        size === "md" ? "h-10 w-10" : "h-8 w-8",
        DOC_KIND_STYLE[kind],
      )}
    >
      <Icon className={size === "md" ? "h-5 w-5" : "h-4 w-4"} aria-hidden />
    </span>
  );
}
