import {
  ALREADY_ATTACHED_CODE,
  INVALID_TARGET_CODE,
  PICKER_NOT_CONFIGURED_CODE,
} from "@/domain/drive-files";
import { CREATE_DOC_TIMEOUT_CODE, CreateDocRequestError } from "./create-doc-api";
import { createDocDialogState, type CreateDocDialogState, type CreateDocDialogStateInput } from "./create-doc-state";
import { PickerLoadError } from "./google-picker";

// Logic thuần cho hộp thoại "Gắn file từ Drive" ở chế độ configured (T018). Tách khỏi component để test không cần jsdom.

export type AttachDialogState = CreateDocDialogState;
export type AttachDialogStateInput = CreateDocDialogStateInput;

/** Cùng luật với hộp thoại tạo tài liệu: chưa kết nối → `connect`, còn lại theo query không gian. */
export function attachDialogState(input: AttachDialogStateInput): AttachDialogState {
  return createDocDialogState(input);
}

const RECENT_HINT = "hãy xem Tài liệu gần đây trước khi thử lại";

/** Picker trả file sai loại / không có file. */
export const PICKER_INVALID_MESSAGE = "Chỉ gắn được một file Google Docs, Sheets hoặc Slides. Hãy chọn lại.";

const MESSAGES = {
  alreadyAttachedUnnamed: "Tài liệu này đã được gắn vào đây.",
  invalidTarget:
    "Taskeo không mở được file này. Chỉ gắn được file Google Docs, Sheets hoặc Slides; nếu file đúng loại, có thể máy chủ cấu hình sai app ID của Google Picker.",
  notFound: "Không gian hoặc dự án đã chọn không còn tồn tại. Hãy chọn lại.",
  notConnected: "Taskeo chưa có quyền với Google Drive. Hãy kết nối lại Google Drive rồi thử lại.",
  pickerNotConfigured: "Google Picker chưa được cấu hình trên máy chủ. Hãy báo quản trị viên đặt khoá API và app ID.",
  unavailable: "Máy chủ chưa sẵn sàng để gắn file từ Google Drive. Thử lại sau.",
  drive: `Google Drive đang lỗi hoặc phản hồi chậm. Tài liệu có thể đã được gắn — ${RECENT_HINT}.`,
  timeout: `Gắn tài liệu quá lâu. Tài liệu có thể đã được gắn — ${RECENT_HINT}.`,
  scriptLoadFailed:
    "Không tải được Google Picker. Kiểm tra kết nối mạng hoặc tắt trình chặn quảng cáo cho trang này rồi thử lại.",
  unauthorized: "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.",
  generic: "Không gắn được tài liệu. Kiểm tra kết nối mạng rồi thử lại.",
} as const;

function alreadyAttachedMessage(fileName: string | undefined): string {
  const name = fileName?.trim();
  return name ? `“${name}” đã được gắn vào đây.` : MESSAGES.alreadyAttachedUnnamed;
}

function requestErrorMessage(error: CreateDocRequestError, fileName: string | undefined): string {
  const { status, code } = error;
  if (status === 409 && code === ALREADY_ATTACHED_CODE) return alreadyAttachedMessage(fileName);
  if (status === 404) return code === INVALID_TARGET_CODE ? MESSAGES.invalidTarget : MESSAGES.notFound;
  if (status === 403) return MESSAGES.notConnected;
  if (status === 503) return code === PICKER_NOT_CONFIGURED_CODE ? MESSAGES.pickerNotConfigured : MESSAGES.unavailable;
  if (status === 502) return MESSAGES.drive;
  if (status === 0 && code === CREATE_DOC_TIMEOUT_CODE) return MESSAGES.timeout;
  if (status === 401) return MESSAGES.unauthorized;
  return MESSAGES.generic;
}

/** Câu thông báo tiếng Việt cho lỗi khi lấy token / nạp Picker / gắn file; không lộ message kỹ thuật. */
export function attachErrorMessage(error: unknown, fileName?: string): string {
  if (error instanceof PickerLoadError) return MESSAGES.scriptLoadFailed;
  if (error instanceof CreateDocRequestError) return requestErrorMessage(error, fileName);
  return MESSAGES.generic;
}

/**
 * Pha của luồng chọn + gắn: `loading` = đang nạp script / lấy token (chưa có Picker); `picking` = Picker đang mở;
 * `attaching` = đang gửi.
 */
export type AttachPhase = "idle" | "loading" | "picking" | "attaching";

/** Đang chọn / gửi: khoá ô và nút chọn. */
export function isAttachBusy(phase: AttachPhase): boolean {
  return phase !== "idle";
}

/**
 * Cho Esc / bấm ngoài / Hủy đóng hộp thoại không. `loading` đóng được (hủy lượt, bỏ kết quả nạp); `picking`
 * thì Picker là iframe đè lên Modal, `attaching` thì yêu cầu đã gửi → không đóng.
 */
export function canDismissAttach(phase: AttachPhase): boolean {
  return phase === "idle" || phase === "loading";
}

const BUTTON_LABELS: Record<AttachPhase, string> = {
  idle: "Chọn từ Google Drive",
  loading: "Đang mở Google Drive…",
  picking: "Đang chọn file trên Google Drive…",
  attaching: "Đang gắn…",
};

/** Nhãn nút chính theo pha. */
export function attachButtonLabel(phase: AttachPhase): string {
  return BUTTON_LABELS[phase];
}
