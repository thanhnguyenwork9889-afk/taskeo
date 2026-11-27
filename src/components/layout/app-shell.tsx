"use client";

import { Suspense, use, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toISODate } from "@/domain/dates";
import { useSessionStart, useWorkspaceState } from "@/store/workspace-store";
import { CreateDialog } from "./create-dialog";
import { cleanedLocation, driveNoticeFromParams } from "./drive-notice";
import { MobileNav } from "./mobile-nav";
import { Sidebar } from "./sidebar";
import { MobileHeader, Topbar } from "./topbar";
import { UIContext, useUI, type CreateRequest, type UIContextValue, type ViewerInfo } from "./ui-context";

const TOAST_MS = 3500;

export function ShellSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-muted" role="status">
      Đang tải không gian làm việc...
    </div>
  );
}

/** Đã bật đăng nhập mà phiên không hợp lệ (cookie hết hạn, bị thu hồi) thì về /login. */
function SessionGuard({ viewerPromise }: { viewerPromise: Promise<ViewerInfo | null> }) {
  const viewer = use(viewerPromise);
  const router = useRouter();
  useEffect(() => {
    if (!viewer) router.replace("/login");
  }, [viewer, router]);
  return null;
}

/** `?drive=<mã>` (wrong-account từ callback signIn, disconnected / disconnect-failed từ ngắt kết nối Drive…) → hiện thông báo rồi bỏ tham số khỏi URL. */
function DriveNotice() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { notify } = useUI();
  const notice = driveNoticeFromParams(params);
  const target = cleanedLocation(pathname, params);
  useEffect(() => {
    if (!notice) return;
    notify(notice);
    router.replace(target, { scroll: false });
  }, [notice, target, router, notify]);
  return null;
}

interface AppShellProps {
  viewerPromise: Promise<ViewerInfo | null>;
  children: ReactNode;
}

export function AppShell({ viewerPromise, children }: AppShellProps) {
  const workspace = useWorkspaceState();
  const now = useSessionStart();
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [createRequest, setCreateRequest] = useState<CreateRequest | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  // Menu mobile: Esc để đóng.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setQuery("");
  }, []);

  const value = useMemo<UIContextValue | null>(
    () => (now ? { viewerPromise, now, today: toISODate(now), query, setQuery, notify: setToast, openCreate: setCreateRequest } : null),
    [viewerPromise, now, query],
  );

  if (!workspace || !value) return <ShellSkeleton />;

  return (
    <UIContext.Provider value={value}>
      <div className="min-h-screen overflow-x-hidden">
        <Suspense fallback={null}>
          <SessionGuard viewerPromise={viewerPromise} />
        </Suspense>
        <Suspense fallback={null}>
          <DriveNotice />
        </Suspense>
        {menuOpen && (
          <button type="button" aria-label="Đóng điều hướng" onClick={() => setMenuOpen(false)} className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden" />
        )}
        <Sidebar open={menuOpen} onNavigate={closeMenu} />
        <div className="lg:ml-[264px]">
          <MobileHeader onOpenMenu={() => setMenuOpen(true)} />
          <Topbar onOpenMenu={() => setMenuOpen(true)} />
          <main className="mx-auto max-w-[1500px] px-4 pb-28 pt-5 md:px-8 md:pb-8 md:pt-8">
            {children}
            <footer className="mt-8 text-xs text-[#777582]">Không gian cho những điều quan trọng.</footer>
          </main>
        </div>
        <MobileNav onNavigate={() => setQuery("")} />
        {toast && (
          <div
            role="status"
            className="fixed bottom-24 left-1/2 z-50 w-[calc(100%-32px)] max-w-md -translate-x-1/2 rounded-xl border border-[#DED7EE] bg-white px-5 py-4 text-sm shadow-lg md:bottom-6"
          >
            {toast}
          </div>
        )}
        {createRequest && <CreateDialog request={createRequest} onClose={() => setCreateRequest(null)} />}
      </div>
    </UIContext.Provider>
  );
}
