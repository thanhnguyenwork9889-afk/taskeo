/** Tham số URL mà callback signIn (T011) gắn khi từ chối tài khoản Google. */
export const DRIVE_NOTICE_PARAM = "drive";

const DRIVE_NOTICES: Readonly<Record<string, string>> = {
  "wrong-account": "Bạn đã chọn tài khoản Google khác với tài khoản đang đăng nhập. Hãy chọn đúng tài khoản.",
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
