import { CalendarDays, FileSpreadsheet, FileText, FolderOpen, LayoutGrid, ListChecks, Presentation, type LucideIcon } from "lucide-react";

export interface NavItem {
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Tổng quan", description: "Hôm nay của bạn", href: "/", icon: LayoutGrid },
  { label: "Công việc", description: "Danh sách và Kanban", href: "/tasks", icon: ListChecks },
  { label: "Soạn thảo", description: "Tài liệu", href: "/docs?type=doc", icon: FileText },
  { label: "Bảng tính", description: "Dữ liệu", href: "/docs?type=sheet", icon: FileSpreadsheet },
  { label: "Trình chiếu", description: "Bài thuyết trình", href: "/docs?type=slide", icon: Presentation },
  { label: "Lịch làm việc", description: "Lịch và sự kiện", href: "/calendar", icon: CalendarDays },
  { label: "Kho lưu trữ", description: "Tệp và thư mục", href: "/docs", icon: FolderOpen },
];

/** Mục điều hướng đang chọn, so cả pathname lẫn ?type=. */
export function isNavActive(item: NavItem, pathname: string, type: string | null): boolean {
  const [path, query] = item.href.split("?");
  if (path !== pathname) return false;
  const itemType = query ? new URLSearchParams(query).get("type") : null;
  return itemType === type;
}
