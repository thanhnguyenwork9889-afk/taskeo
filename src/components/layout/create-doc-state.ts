import { DRIVE_NOT_CONNECTED_CODE } from "@/domain/drive-files";
import { CREATE_DOC_TIMEOUT_CODE, CreateDocRequestError, type NamedOption } from "./create-doc-api";

// Logic thuần cho hộp thoại tạo tài liệu ở chế độ configured (T017). Tách khỏi component để test không cần jsdom.

export type CreateDocDialogState = "connect" | "loading" | "error" | "no_spaces" | "ready";

export interface CreateDocDialogStateInput {
  driveConnected: boolean;
  spacesStatus: "pending" | "error" | "success";
  spaceCount: number;
}

/** Chưa kết nối Drive → mời kết nối (không tải gì); còn lại theo trạng thái query không gian. */
export function createDocDialogState({ driveConnected, spacesStatus, spaceCount }: CreateDocDialogStateInput): CreateDocDialogState {
  if (!driveConnected) return "connect";
  if (spacesStatus === "pending") return "loading";
  if (spacesStatus === "error") return "error";
  return spaceCount > 0 ? "ready" : "no_spaces";
}

/**
 * Không gian chọn sẵn: ID yêu cầu có trong danh sách API → giữ; không (vd. ID store demo, chưa khớp DB
 * cho tới T59) → không gian đầu tiên; danh sách rỗng → `""`.
 */
export function initialSpaceId(requested: string | undefined, spaces: readonly NamedOption[]): string {
  const match = spaces.find((space) => space.id === requested);
  return match?.id ?? spaces[0]?.id ?? "";
}

/** Dự án chọn sẵn: có trong danh sách → giữ, không → `""` (không gắn dự án). */
export function initialProjectId(requested: string | undefined, projects: readonly NamedOption[]): string {
  return projects.find((project) => project.id === requested)?.id ?? "";
}

export interface RequestedProjectWaitInput {
  /** Dự án được yêu cầu khi mở hộp thoại (vd. mở từ trang dự án). */
  requestedProjectId: string | undefined;
  /** `null` = người dùng chưa tự chọn trong ô dự án. */
  projectChoice: string | null;
  /** Vẫn ở không gian chọn sẵn lúc mở. */
  inStartSpace: boolean;
  projectsStatus: "pending" | "error" | "success";
}

/**
 * Có đang chờ dự án được yêu cầu không: mở kèm dự án, người dùng chưa tự chọn, vẫn ở không gian ban đầu và
 * danh sách dự án đang tải (`loading`) hoặc tải lỗi (`error`). Khác `null` → chặn gửi để file không lặng lẽ
 * rơi vào thư mục không gian.
 */
export function requestedProjectWait(input: RequestedProjectWaitInput): "loading" | "error" | null {
  const { requestedProjectId, projectChoice, inStartSpace, projectsStatus } = input;
  if (!requestedProjectId?.trim() || projectChoice !== null || !inStartSpace) return null;
  if (projectsStatus === "pending") return "loading";
  if (projectsStatus === "error") return "error";
  return null;
}

const RECENT_HINT = "hãy xem Tài liệu gần đây trước khi thử lại";

const MESSAGES = {
  notConnected: "Taskeo chưa có quyền với Google Drive. Hãy kết nối Google Drive rồi thử lại.",
  drive: `Google Drive đang lỗi hoặc phản hồi chậm. Tài liệu có thể đã được tạo — ${RECENT_HINT}.`,
  timeout: `Tạo tài liệu quá lâu. Tài liệu có thể đã được tạo — ${RECENT_HINT}.`,
  notFound: "Không gian hoặc dự án đã chọn không còn tồn tại. Hãy chọn lại.",
  unauthorized: "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.",
  generic: "Không tạo được tài liệu. Kiểm tra kết nối mạng rồi thử lại.",
} as const;

/** Câu thông báo tiếng Việt cho lỗi khi tạo tài liệu; không lộ message kỹ thuật. */
export function createDocErrorMessage(error: unknown): string {
  if (!(error instanceof CreateDocRequestError)) return MESSAGES.generic;
  if (error.status === 403 && error.code === DRIVE_NOT_CONNECTED_CODE) return MESSAGES.notConnected;
  if (error.status === 0 && error.code === CREATE_DOC_TIMEOUT_CODE) return MESSAGES.timeout;
  if (error.status === 502) return MESSAGES.drive;
  if (error.status === 404) return MESSAGES.notFound;
  if (error.status === 401) return MESSAGES.unauthorized;
  return MESSAGES.generic;
}
