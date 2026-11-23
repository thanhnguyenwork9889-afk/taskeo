import type { DocKind, Priority, ProjectStatus, TaskStatus } from "@/domain/types";

export const TASK_STATUSES: readonly TaskStatus[] = ["TODO", "IN_PROGRESS", "PAUSED", "DONE"];
export const PRIORITIES: readonly Priority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
export const PROJECT_STATUSES: readonly ProjectStatus[] = ["ACTIVE", "ON_HOLD", "DONE", "ARCHIVED"];
export const DOC_KINDS: readonly DocKind[] = ["doc", "sheet", "slide"];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  TODO: "Chưa bắt đầu",
  IN_PROGRESS: "Đang tiến hành",
  PAUSED: "Tạm dừng",
  DONE: "Xong",
};

export const STATUS_STYLE: Record<TaskStatus, string> = {
  TODO: "bg-slate-100 text-slate-600",
  IN_PROGRESS: "bg-blue-50 text-blue-700",
  PAUSED: "bg-amber-50 text-amber-800",
  DONE: "bg-emerald-50 text-emerald-700",
};

export const OVERDUE_STYLE = "bg-red-50 text-red-700";

export const PRIORITY_LABEL: Record<Priority, string> = {
  LOW: "Thấp",
  MEDIUM: "Trung bình",
  HIGH: "Cao",
  URGENT: "Khẩn cấp",
};

export const PRIORITY_STYLE: Record<Priority, string> = {
  LOW: "bg-slate-100 text-slate-600",
  MEDIUM: "bg-blue-50 text-blue-700",
  HIGH: "bg-amber-50 text-amber-800",
  URGENT: "bg-red-50 text-red-700",
};

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  ACTIVE: "Đang chạy",
  ON_HOLD: "Tạm dừng",
  DONE: "Xong",
  ARCHIVED: "Lưu trữ",
};

export const PROJECT_STATUS_STYLE: Record<ProjectStatus, { badge: string; accent: string }> = {
  ACTIVE: { badge: "bg-blue-50 text-blue-700", accent: "#7960CE" },
  ON_HOLD: { badge: "bg-amber-50 text-amber-800", accent: "#BC8A30" },
  DONE: { badge: "bg-emerald-50 text-emerald-700", accent: "#3B9470" },
  ARCHIVED: { badge: "bg-slate-100 text-slate-600", accent: "#64748B" },
};

export const DOC_KIND_LABEL: Record<DocKind, string> = {
  doc: "Soạn thảo",
  sheet: "Bảng tính",
  slide: "Trình chiếu",
};

export const DOC_KIND_STYLE: Record<DocKind, string> = {
  doc: "bg-blue-50 text-blue-600",
  sheet: "bg-emerald-50 text-emerald-700",
  slide: "bg-amber-50 text-amber-700",
};

/** Bảng màu cho không gian mới: [màu chính, màu nền nhạt]. */
export const SPACE_PALETTE: readonly { color: string; tint: string }[] = [
  { color: "#8B73D5", tint: "#F0ECFA" },
  { color: "#4C9C86", tint: "#E9F4EF" },
  { color: "#D6A243", tint: "#FCF4E2" },
  { color: "#598FD0", tint: "#EBF2FC" },
  { color: "#D0708A", tint: "#FBEDF1" },
];
