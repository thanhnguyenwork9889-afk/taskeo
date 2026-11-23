"use client";

import { useSyncExternalStore } from "react";
import { createSeedState } from "@/lib/seed";
import type { WorkspaceState } from "@/lib/types";
import { workspaceStateSchema } from "@/lib/validation";

// Store phía client cho chế độ demo: giữ state trong bộ nhớ và lưu vào localStorage.
// Giai đoạn 2 sẽ thay bằng API route + TanStack Query; giao diện chỉ phụ thuộc
// vào useWorkspace() và updateWorkspace().

const STORAGE_KEY = "workspace-next:v1";

let state: WorkspaceState | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

/** Đọc từ localStorage. Dữ liệu không hợp lệ được sao lưu sang key khác trước khi dùng dữ liệu mẫu. */
function load(): WorkspaceState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = workspaceStateSchema.safeParse(JSON.parse(raw));
      if (parsed.success) return parsed.data;
      window.localStorage.setItem(`${STORAGE_KEY}:backup-${Date.now()}`, raw);
    }
  } catch {
    // localStorage bị chặn hoặc JSON hỏng: dùng dữ liệu mẫu.
  }
  return createSeedState(new Date());
}

function persist(next: WorkspaceState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Không lưu được (chế độ ẩn danh, hết dung lượng): vẫn chạy trong bộ nhớ.
  }
}

function getSnapshot(): WorkspaceState {
  if (!state) state = load();
  return state;
}

function getServerSnapshot(): null {
  return null;
}

/** Tab khác ghi dữ liệu thì nạp lại, tránh hai tab ghi đè lên nhau. */
function onStorage(event: StorageEvent) {
  if (event.key !== STORAGE_KEY || !event.newValue) return;
  try {
    const parsed = workspaceStateSchema.safeParse(JSON.parse(event.newValue));
    if (!parsed.success) return;
    state = parsed.data;
    emit();
  } catch {
    // Bỏ qua dữ liệu hỏng từ tab khác.
  }
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

export function updateWorkspace(recipe: (current: WorkspaceState) => WorkspaceState) {
  const next = recipe(getSnapshot());
  if (next === state) return;
  state = next;
  persist(next);
  emit();
}

/** null khi đang render phía server / hydrate; sau đó là state thật. */
export function useWorkspaceState(): WorkspaceState | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Dùng bên trong AppShell, nơi state chắc chắn đã sẵn sàng. */
export function useWorkspace(): WorkspaceState {
  const current = useWorkspaceState();
  if (!current) throw new Error("useWorkspace phải được dùng bên trong AppShell sau khi dữ liệu sẵn sàng");
  return current;
}

// ---------- "Bây giờ" của phiên: cố định để render ổn định, tự cập nhật lúc nửa đêm ----------

let sessionNow: Date | null = null;
const clockListeners = new Set<() => void>();
let midnightTimer: ReturnType<typeof setTimeout> | undefined;

function msUntilNextMidnight(from: Date): number {
  const next = new Date(from);
  next.setHours(24, 0, 1, 0);
  return next.getTime() - from.getTime();
}

function scheduleMidnight() {
  clearTimeout(midnightTimer);
  midnightTimer = setTimeout(() => {
    sessionNow = new Date();
    clockListeners.forEach((listener) => listener());
    scheduleMidnight();
  }, msUntilNextMidnight(new Date()));
}

function subscribeClock(listener: () => void) {
  if (clockListeners.size === 0) scheduleMidnight();
  clockListeners.add(listener);
  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0) clearTimeout(midnightTimer);
  };
}

function getSessionNow(): Date {
  if (!sessionNow) sessionNow = new Date();
  return sessionNow;
}

/** null phía server; ở trình duyệt là thời điểm mở app (làm mới sau mỗi nửa đêm). */
export function useSessionStart(): Date | null {
  return useSyncExternalStore(subscribeClock, getSessionNow, getServerSnapshot);
}
