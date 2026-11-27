// Key TanStack Query dùng chung giữa `components/layout` và `features/` (T017).
// `components/layout` không import `features/`, nên key nằm ở đây để hộp thoại tạo tài liệu
// invalidate được danh sách file Drive mà `features/docs` đang hiển thị.

/** Tiền tố key danh sách file Drive (`GET /api/files`); invalidate key này làm mới mọi danh sách. */
export const DRIVE_FILES_QUERY_KEY = ["drive-files"] as const;

/** Danh sách không gian từ `GET /api/spaces` (chế độ configured). */
export const API_SPACES_QUERY_KEY = ["api-spaces"] as const;

/** Key đầy đủ của một danh sách file Drive theo tham số lọc. */
export function driveFilesQueryKey<P>(params: P): readonly [...typeof DRIVE_FILES_QUERY_KEY, P] {
  return [...DRIVE_FILES_QUERY_KEY, params];
}

/** Danh sách dự án của một không gian từ `GET /api/spaces/[id]/projects`. */
export function apiProjectsQueryKey(spaceId: string): readonly [...typeof API_SPACES_QUERY_KEY, string, "projects"] {
  return [...API_SPACES_QUERY_KEY, spaceId, "projects"];
}
