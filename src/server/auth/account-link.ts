import "server-only";

export const GOOGLE_PROVIDER = "google";

/** Dữ liệu để quyết định có chặn gắn tài khoản OAuth vừa chọn vào user hiện tại không. */
export interface AccountLinkInput {
  /** Provider của tài khoản vừa đăng nhập (vd. "google"). */
  readonly provider: string;
  /** Id tài khoản bên provider vừa được chọn ở màn chọn tài khoản. */
  readonly providerAccountId: string;
  /** User của phiên hiện tại; `null` khi chưa đăng nhập. */
  readonly sessionUserId: string | null;
  /** `providerAccountId` của các Account google đang gắn với user của phiên. */
  readonly userGoogleAccountIds: readonly string[];
  /** Tài khoản vừa chọn đã có dòng `Account` trong DB (gắn với bất kỳ user nào). */
  readonly selectedAccountExists: boolean;
}

/**
 * Một user chỉ được có một tài khoản Google.
 *
 * Bối cảnh: khi đang có phiên mà tài khoản OAuth vừa chọn chưa liên kết với ai, Auth.js
 * tự gọi `linkAccount` gắn vào user hiện tại, không hỏi. Tài khoản đã có trong DB thì
 * Auth.js tự xử lý (cùng user → đăng nhập lại; khác user → `OAuthAccountNotLinked`), nên
 * không chặn ở đây.
 *
 * Chặn khi và chỉ khi: có phiên, provider là google, tài khoản vừa chọn chưa có trong DB,
 * và user hiện tại đã có Account google với id khác. Hàm thuần, không đổi đầu vào.
 */
export function shouldBlockAccountLink(input: AccountLinkInput): boolean {
  if (input.sessionUserId === null || input.sessionUserId === "") return false;
  if (input.provider !== GOOGLE_PROVIDER) return false;
  if (input.selectedAccountExists) return false;
  return input.userGoogleAccountIds.some((id) => id !== input.providerAccountId);
}
