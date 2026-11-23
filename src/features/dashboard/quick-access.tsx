"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { NAV_ITEMS } from "@/components/layout/navigation";
import { useUI } from "@/components/layout/ui-context";
import { card, control, cx, primaryButton } from "@/components/ui/styles";

const ICON_STYLES = [
  "bg-blue-50 text-blue-600",
  "bg-emerald-50 text-emerald-700",
  "bg-amber-50 text-amber-700",
  "bg-blue-50 text-blue-600",
  "bg-brand-soft text-brand",
];

export function QuickAccess() {
  const { openCreate } = useUI();
  return (
    <section
      aria-label="Truy cập nhanh"
      className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:p-0 xl:grid-cols-6"
    >
      {NAV_ITEMS.slice(2).map((item, index) => (
        <Link
          key={item.href}
          href={item.href}
          className={cx(control, card, "flex min-w-[156px] shrink-0 snap-start items-center gap-3 px-3 py-4 hover:border-[#C6B5E8] md:min-w-0")}
        >
          <span className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", ICON_STYLES[index])}>
            <item.icon className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block whitespace-nowrap text-sm font-medium">{item.label}</span>
            <span className="mt-1 block text-xs text-muted">{item.description}</span>
          </span>
        </Link>
      ))}
      <button type="button" onClick={() => openCreate({ kind: "space" })} className={cx(primaryButton, "min-w-[156px] shrink-0 snap-start py-4 md:min-w-0")}>
        <Plus className="h-4 w-4" aria-hidden />
        Tạo không gian
      </button>
    </section>
  );
}
