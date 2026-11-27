import { isDriveUrl } from "@/domain/validation";

// Mở tab mới tới file Drive vừa tạo mà không bị chặn popup (T017): mở tab trống ngay trong sự kiện bấm,
// rồi gán địa chỉ khi API trả về. Không truyền feature "noopener" vì khi đó `window.open` luôn trả `null`;
// thay vào đó đặt `opener = null` thủ công. Kiểu tối thiểu để test bằng đối tượng giả.

/** Phần của `Window` mà tab chờ cần dùng. */
export interface PendingTab {
  opener: unknown;
  location: { href: string };
  close(): void;
}

export type OpenWindow = (url: string, target: string) => PendingTab | null;

export type FinishPendingTabResult = "opened" | "blocked" | "no_url";

/** Gọi đồng bộ trong handler bấm (vd. `openPendingTab(window.open.bind(window))`). Bị chặn → `null`. */
export function openPendingTab(open: OpenWindow): PendingTab | null {
  let tab: PendingTab | null;
  try {
    tab = open("", "_blank");
  } catch {
    return null;
  }
  if (!tab) return null;
  try {
    tab.opener = null;
  } catch {
    // Một số trình duyệt không cho gán; tab vẫn dùng được.
  }
  return tab;
}

/** Đóng tab chờ (nếu có); không bao giờ ném. */
export function closePendingTab(tab: PendingTab | null): void {
  if (!tab) return;
  try {
    tab.close();
  } catch {
    // Tab đã đóng hoặc không còn truy cập được.
  }
}

/**
 * Sau khi API trả về: url null / không phải Drive HTTPS → đóng tab, `no_url`; không có tab (bị chặn) → `blocked`
 * (giao diện hiện liên kết); còn lại chuyển tab tới file → `opened`. Gán địa chỉ ném lỗi → cố đóng tab, `blocked`.
 */
export function finishPendingTab(tab: PendingTab | null, url: string | null): FinishPendingTabResult {
  if (!url || !isDriveUrl(url)) {
    closePendingTab(tab);
    return "no_url";
  }
  if (!tab) return "blocked";
  try {
    tab.location.href = url;
  } catch {
    closePendingTab(tab);
    return "blocked";
  }
  return "opened";
}
