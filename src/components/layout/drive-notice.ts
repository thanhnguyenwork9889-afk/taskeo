/**
 * Tham số URL server gắn để báo kết quả thao tác Google Drive:
 * callback signIn khi từ chối tài khoản Google (T011), action ngắt kết nối Drive (T012).
 */
export const DRIVE_NOTICE_PARAM = "drive";

/**
 * Mã `?drive=` → câu thông báo. Phía server dùng cùng các chuỗi literal này (không import chéo lớp);
 * test khoá từng mã để hai bên giữ khớp.
 * - `wrong-account`: callback signIn từ chối vì chọn tài khoản Google khác (T011).
 * - `disconnected`: ngắt kết nối Drive thành công, đã thu hồi quyền ở Google (T012).
 * - `disconnect-failed`: ngắt kết nối thất bại, chưa xoá gì (T012).
 * - `disconnected-local`: đã xoá kết nối ở Taskeo nhưng không thu hồi được quyền ở Google
 *   (ví dụ token không giải mã được), người dùng phải tự gỡ quyền ở trang tài khoản Google (T012).
 */
const DRIVE_NOTICES: Readonly<Record<string, string>> = {
  "wrong-account": "Bạn đã chọn tài khoản Google khác với tài khoản đang đăng nhập. Hãy chọn đúng tài khoản.",
  disconnected: "Đã ngắt kết nối Google Drive.",
  "disconnect-failed": "Không ngắt kết nối được Google Drive. Hãy thử lại.",
  "disconnected-local":
    "Đã xoá kết nối Google Drive khỏi Taskeo, nhưng quyền ở Google vẫn còn. Hãy gỡ quyền Taskeo ở trang Tài khoản Google (Bảo mật → Ứng dụng bên thứ ba).",
};

/** Đủ cho cả URLSearchParams lẫn ReadonlyURLSearchParams của next/navigation. */
export interface ReadableSearchParams {
  get(name: string): string | null;
  toString(): string;
}

/** Câu thông báo ứng với `?drive=…`, hoặc null nếu không có / giá trị lạ. */
export function driveNoticeFromParams(params: Pick<ReadableSearchParams, "get">): string | null {
  const value = params.get(DRIVE_NOTICE_PARAM);
  if (!value || !Object.hasOwn(DRIVE_NOTICES, value)) return null;
  return DRIVE_NOTICES[value];
}

/** Query string mới không còn `key`: "" khi rỗng, ngược lại bắt đầu bằng "?". Không sửa `params`. */
export function searchWithout(params: ReadableSearchParams, key: string): string {
  const next = new URLSearchParams(params.toString());
  next.delete(key);
  const query = next.toString();
  return query ? `?${query}` : "";
}

/**
 * Đường dẫn nội bộ để `router.replace` sau khi bỏ tham số `drive`: `pathname` + query còn lại.
 * Nếu `pathname` không bắt đầu bằng "/" hoặc bắt đầu bằng "//" hay "/\" (có thể bị hiểu là URL ngoài),
 * trả về "/" + query còn lại thay vì `pathname`. Luôn trả chuỗi bắt đầu bằng đúng một "/". Không sửa `params`.
 */
export function cleanedLocation(pathname: string, params: ReadableSearchParams): string {
  const rest = searchWithout(params, DRIVE_NOTICE_PARAM);
  return `${isSafeInternalPath(pathname) ? pathname : "/"}${rest}`;
}

function isSafeInternalPath(pathname: string): boolean {
  return pathname.startsWith("/") && !pathname.startsWith("//") && !pathname.startsWith("/\\");
}
