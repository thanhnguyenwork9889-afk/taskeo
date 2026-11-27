import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/server/db";
import { shouldBlockAccountLink } from "@/server/auth/account-link";

const GOOGLE_PROVIDER = "google";

/**
 * Tên cookie phiên theo mặc định của Auth.js: `__Secure-` khi chạy https, không tiền tố khi http.
 * Nếu sau này cấu hình `cookies` hoặc `useSecureCookies` trong auth.ts thì phải sửa theo.
 * Có cả hai thì ưu tiên `__Secure-` (đứng trước trong danh sách).
 */
const SESSION_COOKIE_NAMES = ["__Secure-authjs.session-token", "authjs.session-token"] as const;

/**
 * Nơi chuyển về khi người dùng chọn tài khoản Google khác tài khoản đang đăng nhập.
 * Phải khớp DRIVE_NOTICE_PARAM ("drive") + "wrong-account" trong
 * src/components/layout/drive-notice.ts (không import chéo lớp).
 */
export const WRONG_ACCOUNT_REDIRECT = "/?drive=wrong-account";

/** Phần `account` của callback `signIn` mà bộ chặn cần. */
export interface SignInGuardParams {
  readonly account?: { readonly provider: string; readonly providerAccountId: string } | null;
}

interface GoogleAccountRow {
  readonly userId: string;
  readonly providerAccountId: string;
}

/**
 * User của phiên hiện tại, đọc thẳng từ cookie + bảng Session.
 * - Không dùng auth(): @auth/core bắt mọi lỗi adapter và trả null, khiến DB lỗi bị hiểu là
 *   "không có phiên" → cho qua → linkAccount vẫn chạy. Ở đây lỗi DB lan ra.
 * - Không lọc `expires`: Auth.js gắn tài khoản dựa trên phiên mà không kiểm hạn, nên bộ chặn
 *   cũng coi token có trong DB là có phiên.
 */
export async function readSessionUserId(): Promise<string | null> {
  const store = await cookies();
  const sessionToken = SESSION_COOKIE_NAMES.map((name) => store.get(name)?.value).find((value) => !!value);
  if (!sessionToken) return null;

  const session = await prisma.session.findUnique({ where: { sessionToken }, select: { userId: true } });
  return session?.userId ?? null;
}

/** Một truy vấn: Account google của tài khoản vừa chọn (nếu đã có) và của user hiện tại. */
export function findGoogleAccountsForLink(
  providerAccountId: string,
  userId: string,
): Promise<GoogleAccountRow[]> {
  return prisma.account.findMany({
    where: { provider: GOOGLE_PROVIDER, OR: [{ providerAccountId }, { userId }] },
    select: { userId: true, providerAccountId: true },
  });
}

/**
 * Callback `signIn` của Auth.js: chạy trước khi ghi DB. Trả WRONG_ACCOUNT_REDIRECT để chặn gắn
 * tài khoản Google thứ hai vào user đang đăng nhập (không ghi gì vào DB); `true` để cho qua.
 * Lỗi truy vấn lan ra → Auth.js báo AccessDenied, không bao giờ thành "cho qua".
 */
export async function guardSignIn({ account }: SignInGuardParams): Promise<true | string> {
  if (!account || account.provider !== GOOGLE_PROVIDER) return true;

  const sessionUserId = await readSessionUserId();
  if (!sessionUserId) return true;

  const { providerAccountId } = account;
  const rows = await findGoogleAccountsForLink(providerAccountId, sessionUserId);
  const blocked = shouldBlockAccountLink({
    provider: account.provider,
    providerAccountId,
    sessionUserId,
    selectedAccountExists: rows.some((row) => row.providerAccountId === providerAccountId),
    userGoogleAccountIds: rows.filter((row) => row.userId === sessionUserId).map((row) => row.providerAccountId),
  });
  return blocked ? WRONG_ACCOUNT_REDIRECT : true;
}
