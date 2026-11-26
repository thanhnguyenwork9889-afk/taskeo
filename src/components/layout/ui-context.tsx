"use client";

import { createContext, use, useContext } from "react";
import type { DocKind, ISODate } from "@/domain/types";

export interface ViewerInfo {
  name: string;
  email: string | null;
  image: string | null;
  isDemo: boolean;
  /** Đã cấp quyền Google Drive (drive.file) hay chưa. */
  driveConnected: boolean;
}

export type CreateRequest =
  | { kind: "task"; spaceId?: string; projectId?: string }
  | { kind: "space" }
  | { kind: "project"; spaceId: string }
  | { kind: "doc"; docKind?: DocKind; spaceId?: string; projectId?: string };

export interface UIContextValue {
  /** null = đã bật đăng nhập nhưng chưa có phiên (SessionGuard sẽ chuyển về /login). */
  viewerPromise: Promise<ViewerInfo | null>;
  /** Thời điểm mở app, cố định trong suốt phiên để render ổn định. */
  now: Date;
  today: ISODate;
  query: string;
  setQuery: (value: string) => void;
  notify: (message: string) => void;
  openCreate: (request: CreateRequest) => void;
}

export const UIContext = createContext<UIContextValue | null>(null);

export function useUI(): UIContextValue {
  const value = useContext(UIContext);
  if (!value) throw new Error("useUI phải được dùng bên trong AppShell");
  return value;
}

const SIGNED_OUT: ViewerInfo = { name: "Bạn", email: null, image: null, isDemo: false, driveConnected: false };

/** Người dùng hiện tại. Component gọi hook này phải nằm trong <Suspense>. */
export function useViewer(): ViewerInfo {
  return use(useUI().viewerPromise) ?? SIGNED_OUT;
}

/** So khớp không phân biệt hoa thường theo tiếng Việt. */
export function matchesQuery(query: string, ...fields: (string | null | undefined)[]): boolean {
  const needle = query.trim().toLocaleLowerCase("vi");
  if (!needle) return true;
  return fields.some((field) => field?.toLocaleLowerCase("vi").includes(needle));
}
