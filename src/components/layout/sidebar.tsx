"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { LayoutGrid, Plus } from "lucide-react";
import { APP_NAME, appEnvLabel, getAppEnv } from "@/config/app";
import { useWorkspace } from "@/store/workspace-store";
import { control, cx } from "@/components/ui/styles";
import { isNavActive, NAV_ITEMS } from "./navigation";
import { useUI, useViewer } from "./ui-context";

// NEXT_PUBLIC_* được inline lúc build nên server và client cho cùng giá trị (không lệch hydration).
const ENV_LABEL = appEnvLabel(getAppEnv());
const ENV_PILL_CLASS: Record<string, string> = {
  Staging: "bg-amber-100 text-amber-800",
  Dev: "bg-slate-100 text-slate-700",
};

interface SidebarProps {
  open: boolean;
  onNavigate: () => void;
}

export function Sidebar({ open, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const type = useSearchParams().get("type");
  const { spaces } = useWorkspace();
  const { openCreate } = useUI();

  return (
    <aside
      className={cx(
        "fixed inset-y-0 left-0 z-40 flex w-[264px] flex-col overflow-y-auto border-r border-[#ECECF2] bg-white px-5 py-8 transition-transform lg:translate-x-0",
        // Khi đóng trên màn nhỏ: invisible để các link không nhận focus bằng Tab.
        open ? "translate-x-0" : "-translate-x-full max-lg:invisible",
      )}
    >
      <Link href="/" onClick={onNavigate} className="mb-10 flex items-center gap-3 px-3 text-[23px] font-bold tracking-[-0.8px]">
        <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-brand text-white">
          <LayoutGrid className="h-5 w-5" aria-hidden />
        </span>
        {APP_NAME}
        {ENV_LABEL && (
          <span
            aria-label={`Môi trường: ${ENV_LABEL}`}
            className={cx(
              "rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-normal",
              ENV_PILL_CLASS[ENV_LABEL] ?? "bg-slate-100 text-slate-700",
            )}
          >
            {ENV_LABEL}
          </span>
        )}
      </Link>

      <nav aria-label="Điều hướng chính" className="space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = isNavActive(item, pathname, type);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cx(
                control,
                "flex w-full items-center gap-3 px-3 text-sm",
                active ? "bg-brand-soft font-semibold text-brand-ink" : "text-[#666675] hover:bg-canvas",
              )}
            >
              <item.icon className="h-5 w-5 shrink-0" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mb-2 mt-8 flex items-center justify-between pl-3">
        <h2 className="text-xs font-semibold tracking-[1px] text-[#747481]">KHÔNG GIAN LÀM VIỆC</h2>
        <button
          type="button"
          aria-label="Thêm không gian"
          onClick={() => openCreate({ kind: "space" })}
          className={cx(control, "flex w-11 items-center justify-center text-[#747481]")}
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <nav aria-label="Không gian" className="space-y-1">
        {spaces.map((space) => {
          const href = `/spaces/${space.id}`;
          const active = pathname === href;
          return (
            <Link
              key={space.id}
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cx(
                control,
                "flex w-full items-center gap-3 px-3 text-sm",
                active ? "bg-brand-soft text-brand-ink" : "text-[#666675] hover:bg-canvas",
              )}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: space.color }} />
              <span className="truncate">{space.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-10">
        <div className="flex items-center gap-2 px-2 text-xs text-[#737380]">
          <span className="h-1.5 w-1.5 rounded-full bg-brand" />
          <Suspense fallback="Đang kiểm tra phiên...">
            <SessionStatus />
          </Suspense>
        </div>
      </div>
    </aside>
  );
}

function SessionStatus() {
  const viewer = useViewer();
  return <>{viewer.isDemo ? "Chế độ demo · Dữ liệu mẫu trên trình duyệt" : "Đã đăng nhập Google"}</>;
}
