import type { ViewerInfo } from "./ui-context";

/** Sidebar hiển thị gì cho Google Drive: ẩn (demo), nút kết nối, hoặc nhãn đã kết nối. */
export type DriveStatus = "hidden" | "connect" | "connected";

export function driveStatus(viewer: Pick<ViewerInfo, "isDemo" | "driveConnected">): DriveStatus {
  if (viewer.isDemo) return "hidden";
  return viewer.driveConnected ? "connected" : "connect";
}
