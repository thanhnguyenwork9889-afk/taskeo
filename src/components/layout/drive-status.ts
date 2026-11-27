import type { ViewerInfo } from "./ui-context";

/** Sidebar hiển thị gì cho Google Drive: ẩn (demo), công tắc tắt (chưa kết nối), hoặc công tắc bật (đã kết nối). */
export type DriveStatus = "hidden" | "connect" | "connected";

export function driveStatus(viewer: Pick<ViewerInfo, "isDemo" | "driveConnected">): DriveStatus {
  if (viewer.isDemo) return "hidden";
  return viewer.driveConnected ? "connected" : "connect";
}

/**
 * Đường dẫn trang hiện tại (path + query) để server action quay lại sau khi xong.
 * `search` có thể rỗng, có hoặc không có "?" ở đầu (vd. `URLSearchParams.toString()`); "?" thừa bị bỏ.
 */
export function currentLocation(pathname: string, search: string): string {
  const query = search.trim().replace(/^\?/, "");
  return query ? `${pathname}?${query}` : pathname;
}
