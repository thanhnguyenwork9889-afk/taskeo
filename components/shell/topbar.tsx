"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { Bell, ChevronDown, Menu, Plus, Search } from "lucide-react";
import { signOutAction } from "@/app/actions/auth";
import { isOverdue } from "@/lib/dates";
import { useWorkspace } from "@/lib/workspace-store";
import { control, cx, field, primaryButton } from "@/lib/ui";
import { useUI, useViewer } from "./ui-context";

type Panel = "notifications" | "profile" | null;

function Avatar({ name, image }: { name: string; image: string | null }) {
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element -- avatar Google, không cần tối ưu ảnh
    return <img src={image} alt="" className="h-9 w-9 rounded-full" referrerPolicy="no-referrer" />;
  }
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#E9E0F5] text-sm font-semibold text-brand-ink">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

const AvatarPlaceholder = () => <span className="h-9 w-9 rounded-full bg-[#EEEAF5]" aria-hidden />;

function useOverdueCount(): number {
  const { tasks } = useWorkspace();
  const { today } = useUI();
  return tasks.filter((t) => isOverdue(t, today)).length;
}

function ProfileMenu({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const viewer = useViewer();
  return (
    <>
      <button type="button" onClick={onToggle} aria-expanded={open} className={cx(control, "flex items-center gap-3")}>
        <Avatar name={viewer.name} image={viewer.image} />
        <span className="max-w-40 truncate text-sm font-medium">{viewer.name}</span>
        <ChevronDown className="h-4 w-4 text-[#747481]" aria-hidden />
      </button>
      {open && (
        <div className="absolute right-0 top-14 z-20 w-64 rounded-xl border border-[#EAEAF0] bg-white p-5 shadow-lg">
          <p className="truncate text-sm font-semibold">{viewer.email ?? "Không gian cá nhân"}</p>
          {viewer.isDemo ? (
            <p className="mt-2 text-sm leading-6 text-muted">Chế độ demo · Chưa cấu hình đăng nhập Google.</p>
          ) : (
            <form action={signOutAction}>
              <button type="submit" className={cx(control, "mt-2 text-sm text-brand-ink")}>
                Đăng xuất
              </button>
            </form>
          )}
        </div>
      )}
    </>
  );
}

function NotificationsMenu({ open, onToggle, onClose }: { open: boolean; onToggle: () => void; onClose: () => void }) {
  const overdue = useOverdueCount();
  return (
    <>
      <button
        type="button"
        aria-label="Thông báo"
        aria-expanded={open}
        onClick={onToggle}
        className={cx(control, "relative flex w-11 items-center justify-center text-[#666675]")}
      >
        <Bell className="h-5 w-5" aria-hidden />
        {overdue > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full border-2 border-white bg-[#E69383]" />}
      </button>
      {open && (
        <div className="absolute right-0 top-14 z-20 w-72 rounded-xl border border-[#EAEAF0] bg-white p-5 shadow-lg">
          <h3 className="font-semibold">Thông báo</h3>
          <p className="mt-3 text-sm leading-6 text-muted">
            {overdue ? `Bạn có ${overdue} công việc quá hạn cần xem lại.` : "Không có công việc quá hạn. Tuyệt vời!"}
          </p>
          {overdue > 0 && (
            <Link href="/tasks?due=overdue" onClick={onClose} className={cx(control, "mt-2 inline-flex items-center text-sm text-brand-ink")}>
              Xem công việc
            </Link>
          )}
        </div>
      )}
    </>
  );
}

export function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { query, setQuery, openCreate } = useUI();
  const search = useRef<HTMLInputElement>(null);
  const [panel, setPanel] = useState<Panel>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        search.current?.focus();
      }
      if (event.key === "Escape") setPanel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggle = (name: Exclude<Panel, null>) => setPanel((current) => (current === name ? null : name));

  return (
    <header className="hidden h-[88px] items-center justify-between gap-4 border-b border-[#ECECF2] bg-white px-5 md:flex md:px-8">
      <button type="button" aria-label="Mở điều hướng" onClick={onOpenMenu} className={cx(control, "px-2 lg:hidden")}>
        <Menu className="h-5 w-5" aria-hidden />
      </button>
      <div className="flex min-w-0 flex-1 items-center gap-3 text-[#7C7B8A]">
        <Search className="h-5 w-5 shrink-0" aria-hidden />
        <input
          ref={search}
          type="search"
          aria-label="Tìm kiếm trong workspace"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Tìm công việc, dự án, tài liệu..."
          className="min-h-11 w-full min-w-0 max-w-[360px] bg-transparent text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand"
        />
        <kbd className="whitespace-nowrap rounded border border-[#E8E8EF] bg-[#FAFAFC] px-1.5 py-1 text-xs">Ctrl K</kbd>
      </div>
      <button type="button" onClick={() => openCreate({ kind: "task" })} className={primaryButton}>
        <Plus className="h-4 w-4" aria-hidden />
        Tạo mới
      </button>
      <div className="relative">
        <NotificationsMenu open={panel === "notifications"} onToggle={() => toggle("notifications")} onClose={() => setPanel(null)} />
      </div>
      <div className="relative border-l border-[#ECECF2] pl-5">
        <Suspense fallback={<AvatarPlaceholder />}>
          <ProfileMenu open={panel === "profile"} onToggle={() => toggle("profile")} />
        </Suspense>
      </div>
    </header>
  );
}

function MobileIdentity() {
  const viewer = useViewer();
  return (
    <>
      <Avatar name={viewer.name} image={viewer.image} />
      <span className="min-w-0 text-left">
        <span className="block text-xs text-muted">Không gian cá nhân</span>
        <span className="mt-0.5 block truncate text-sm font-semibold">{viewer.name}</span>
      </span>
    </>
  );
}

export function MobileHeader({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { query, setQuery } = useUI();
  const overdue = useOverdueCount();
  const [searching, setSearching] = useState(false);

  return (
    <>
      <header className="flex h-[76px] items-center justify-between border-b border-[#ECECF2] bg-white px-4 md:hidden">
        <button type="button" onClick={onOpenMenu} aria-label="Mở điều hướng" className={cx(control, "flex min-w-0 items-center gap-3")}>
          <Suspense fallback={<AvatarPlaceholder />}>
            <MobileIdentity />
          </Suspense>
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Tìm kiếm"
            aria-expanded={searching}
            onClick={() => {
              // Đóng ô tìm kiếm thì xoá luôn từ khoá, tránh danh sách bị lọc mà không thấy lý do.
              if (searching) setQuery("");
              setSearching(!searching);
            }}
            className={cx(control, "flex w-11 items-center justify-center text-muted")}
          >
            <Search className="h-5 w-5" aria-hidden />
          </button>
          <Link href="/tasks?due=overdue" aria-label="Xem công việc quá hạn" className={cx(control, "relative flex w-11 items-center justify-center text-muted")}>
            <Bell className="h-5 w-5" aria-hidden />
            {overdue > 0 && <span className="absolute right-3 top-2 h-1.5 w-1.5 rounded-full bg-brand" />}
          </Link>
        </div>
      </header>
      {searching && (
        <div className="border-b border-[#ECECF2] bg-white px-4 pb-4 md:hidden">
          <input
            autoFocus
            type="search"
            aria-label="Tìm kiếm trong workspace"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm kiếm trong workspace..."
            className={field}
          />
        </div>
      )}
    </>
  );
}
