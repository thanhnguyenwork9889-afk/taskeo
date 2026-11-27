// Quyết định nút "Gắn file từ Drive" làm gì theo chế độ chạy (T018).

export type AttachEntryAction = "demo_dialog" | "drive_dialog" | "hidden";

/**
 * Demo: chỉ mở hộp thoại dán liên kết khi nơi gọi có hộp thoại demo, không thì ẩn nút (demo không
 * bao giờ mở hộp thoại Picker). Configured: luôn mở hộp thoại Google Picker.
 */
export function attachEntryAction(isDemo: boolean, hasDemoHandler: boolean): AttachEntryAction {
  if (!isDemo) return "drive_dialog";
  return hasDemoHandler ? "demo_dialog" : "hidden";
}
