"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, FolderOpen, LayoutGrid, ListChecks, Plus } from "lucide-react";
import { control, cx } from "@/lib/ui";
import { useUI } from "./ui-context";

const ITEMS = [
  { label: "Tổng quan", href: "/", icon: LayoutGrid, match: (p: string) => p === "/" },
  { label: "Công việc", href: "/tasks", icon: ListChecks, match: (p: string) => p === "/tasks" },
  { label: "Lịch", href: "/calendar", icon: CalendarDays, match: (p: string) => p === "/calendar" },
  { label: "Không gian", href: "/spaces", icon: FolderOpen, match: (p: string) => p.startsWith("/spaces") || p.startsWith("/projects") },
];

export function MobileNav({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();
  const { openCreate } = useUI();
  const itemClass = (active: boolean) =>
    cx(control, "flex min-h-14 flex-col items-center justify-end gap-1.5 pb-1 text-xs", active ? "font-semibold text-brand-ink" : "text-muted");

  const renderLink = (item: (typeof ITEMS)[number]) => {
    const active = item.match(pathname);
    return (
      <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={itemClass(active)}>
        <item.icon className="h-5 w-5" aria-hidden />
        {item.label}
      </Link>
    );
  };

  return (
    <nav
      aria-label="Điều hướng mobile"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 items-end border-t border-[#E9E4F2] bg-white px-2 pb-[max(12px,env(safe-area-inset-bottom))] pt-2 md:hidden"
    >
      {ITEMS.slice(0, 2).map(renderLink)}
      <button type="button" onClick={() => openCreate({ kind: "task" })} className={itemClass(false)}>
        <span className="-mt-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-brand text-white ring-4 ring-white">
          <Plus className="h-6 w-6" aria-hidden />
        </span>
        Tạo mới
      </button>
      {ITEMS.slice(2).map(renderLink)}
    </nav>
  );
}
