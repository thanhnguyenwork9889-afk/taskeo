import type { ActivityType, DocKind, Priority, ProjectStatus, SpaceIcon, TaskStatus } from "@/domain/types";

export const TASK_STATUSES: readonly TaskStatus[] = ["TODO", "IN_PROGRESS", "PAUSED", "DONE"];
export const PRIORITIES: readonly Priority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
export const PROJECT_STATUSES: readonly ProjectStatus[] = ["ACTIVE", "ON_HOLD", "DONE", "ARCHIVED"];
export const DOC_KINDS: readonly DocKind[] = ["doc", "sheet", "slide"];
export const ACTIVITY_TYPES = [
  "task_created",
  "task_done",
  "task_updated",
  "project_created",
  "doc_created",
] as const satisfies readonly ActivityType[];

/** Câu thông báo mặc định theo loại hoạt động (demo và server dùng chung). */
export const ACTIVITY_MESSAGE: Record<ActivityType, string> = {
  task_created: "Tạo công việc",
  task_done: "Hoàn thành công việc",
  task_updated: "Cập nhật công việc",
  project_created: "Tạo dự án",
  doc_created: "Tạo tài liệu",
};

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

/** Nhãn lối tắt Drive (file gốc nằm chỗ khác, được gắn vào thư mục Taskeo) — T018. */
export const ATTACHED_LABEL = "Đã gắn";
export const ATTACHED_TITLE = "Lối tắt tới file gốc trên Drive, được gắn vào thư mục Taskeo";

export const DOC_KIND_STYLE: Record<DocKind, string> = {
  doc: "bg-blue-50 text-blue-600",
  sheet: "bg-emerald-50 text-emerald-700",
  slide: "bg-amber-50 text-amber-700",
};

export interface SpacePaletteEntry {
  /** Màu chính (hex). */
  color: string;
  /** Màu nền nhạt (hex). */
  tint: string;
  /** Tên màu tiếng Việt cho trình đọc màn hình / tooltip. */
  label: string;
}

/** Bảng màu cho không gian mới: màu chính, màu nền nhạt, tên màu. */
export const SPACE_PALETTE: readonly SpacePaletteEntry[] = [
  { color: "#8B73D5", tint: "#F0ECFA", label: "Tím" },
  { color: "#4C9C86", tint: "#E9F4EF", label: "Xanh lá" },
  { color: "#D6A243", tint: "#FCF4E2", label: "Vàng" },
  { color: "#598FD0", tint: "#EBF2FC", label: "Xanh dương" },
  { color: "#D0708A", tint: "#FBEDF1", label: "Hồng" },
];

/** Id icon của không gian (giao diện tự ánh xạ id → icon). Phần tử đầu là mặc định. */
export const SPACE_ICONS = [
  "folder",
  "briefcase",
  "book",
  "graduation",
  "home",
  "heart",
  "code",
  "palette",
  "shopping",
  "wrench",
] as const;

export const DEFAULT_SPACE_ICON = SPACE_ICONS[0];

export const SPACE_ICON_LABEL: Record<SpaceIcon, string> = {
  folder: "Thư mục",
  briefcase: "Công việc",
  book: "Sách",
  graduation: "Học tập",
  home: "Gia đình",
  heart: "Sức khoẻ",
  code: "Lập trình",
  palette: "Sáng tạo",
  shopping: "Mua sắm",
  wrench: "Kỹ thuật",
};

/** Màu nền nhạt tương ứng màu chính; màu ngoài bảng dùng màu nền của màu đầu tiên. */
export function tintForColor(color: string): string {
  const match = SPACE_PALETTE.find((entry) => entry.color.toLowerCase() === color.toLowerCase());
  return (match ?? SPACE_PALETTE[0]).tint;
}
