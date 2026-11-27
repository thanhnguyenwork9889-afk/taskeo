import { DRIVE_NOT_CONNECTED_CODE } from "@/domain/drive-files";
import { CreateDocRequestError, type NamedOption } from "./create-doc-api";

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

const MESSAGES = {
  notConnected: "Taskeo chưa có quyền với Google Drive. Hãy kết nối Google Drive rồi thử lại.",
  drive: "Google Drive đang lỗi hoặc phản hồi chậm. Vui lòng thử lại sau ít phút.",
  notFound: "Không gian hoặc dự án đã chọn không còn tồn tại. Hãy chọn lại.",
  unauthorized: "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.",
  generic: "Không tạo được tài liệu. Kiểm tra kết nối mạng rồi thử lại.",
} as const;

/** Câu thông báo tiếng Việt cho lỗi khi tạo tài liệu; không lộ message kỹ thuật. */
export function createDocErrorMessage(error: unknown): string {
  if (!(error instanceof CreateDocRequestError)) return MESSAGES.generic;
  if (error.status === 403 && error.code === DRIVE_NOT_CONNECTED_CODE) return MESSAGES.notConnected;
  if (error.status === 502) return MESSAGES.drive;
  if (error.status === 404) return MESSAGES.notFound;
  if (error.status === 401) return MESSAGES.unauthorized;
  return MESSAGES.generic;
}
