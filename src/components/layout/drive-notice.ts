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
