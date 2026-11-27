"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { buildIncrementalAuthorizationParams } from "@/server/auth/google-tokens";
import { toSafeRedirectPath, withQueryParam } from "@/server/auth/redirect-path";
import { getApiUserId, isAuthConfigured } from "@/server/auth/session";
import { GOOGLE_ACCOUNT_ORDER } from "@/server/google/granted-scopes";
import { GOOGLE_SCOPES } from "@/server/google/scopes";

/** Giá trị ô tick "Kết nối Google Drive luôn" được coi là bật; mọi giá trị khác là không tick. */
const CONNECT_DRIVE_ON = "on";

/**
 * Đăng nhập bằng Google.
 * - Demo / cấu hình thiếu → về "/"; không gọi Google.
 * - Ô tick `connectDrive` đúng bằng "on" → xin luôn drive.file trong lượt đăng nhập này
 *   (cùng offline + consent + include_granted_scopes); ngược lại chỉ xin scope đăng nhập như cũ.
 */
export async function signInWithGoogle(formData: FormData) {
  if (!isAuthConfigured()) redirect("/");
  const { signIn } = await import("@/server/auth/auth");
  if (formData.get("connectDrive") === CONNECT_DRIVE_ON) {
    await signIn("google", { redirectTo: "/" }, buildIncrementalAuthorizationParams([GOOGLE_SCOPES.drive]));
    return;
  }
  await signIn("google", { redirectTo: "/" });
}

/**
 * Xin thêm quyền Google Drive (drive.file) cho người dùng đang đăng nhập (incremental authorization).
 * Đi qua một lượt đăng nhập Google; events.signIn lưu scope mới vào Account.scope.
 * - Demo / cấu hình thiếu → về "/"; chưa đăng nhập → "/login"; không gọi Google.
 * - login_hint = email trong phiên chỉ để Google chọn sẵn đúng tài khoản. Nếu người dùng vẫn
 *   chọn tài khoản khác, callback signIn (guardSignIn) từ chối, không ghi DB, và chuyển về
 *   "/?drive=wrong-account".
 * - redirectTo lấy từ form nên chỉ nhận đường dẫn nội bộ.
 */
export async function connectGoogleDrive(formData: FormData) {
  const user = await getApiUserId();
  if (!user.ok) redirect(user.status === 401 ? "/login" : "/");

  const { auth, signIn } = await import("@/server/auth/auth");
  const email = (await auth())?.user?.email;
  await signIn(
    "google",
    { redirectTo: toSafeRedirectPath(formData.get("redirectTo")) },
    {
      ...buildIncrementalAuthorizationParams([GOOGLE_SCOPES.drive]),
      ...(email ? { login_hint: email } : {}),
    },
  );
}

// Mã `?drive=` báo kết quả ngắt kết nối; phải khớp DRIVE_NOTICES ở components/layout/drive-notice.ts
// (không import chéo lớp, test khoá literal).
const DRIVE_NOTICE_DISCONNECTED = "disconnected";
const DRIVE_NOTICE_DISCONNECTED_LOCAL = "disconnected-local";
const DRIVE_NOTICE_DISCONNECT_FAILED = "disconnect-failed";

/**
 * Kết quả ngắt kết nối:
 * - "disconnected": đã thu hồi ở Google (hoặc token đã hết hiệu lực / không còn token) và đã xoá DB.
 * - "disconnected-local": token không giải mã được nên chỉ xoá khỏi DB; quyền ở Google có thể còn.
 * - "failed": không đổi được trạng thái (lỗi đọc / ghi DB, Google từ chối, không có Account google).
 */
type DisconnectOutcome = "disconnected" | "disconnected-local" | "failed";

const DRIVE_NOTICE_BY_OUTCOME: Readonly<Record<DisconnectOutcome, string>> = {
  disconnected: DRIVE_NOTICE_DISCONNECTED,
  "disconnected-local": DRIVE_NOTICE_DISCONNECTED_LOCAL,
  failed: DRIVE_NOTICE_DISCONNECT_FAILED,
};

/** Chỉ lấy tên lỗi; message có thể chứa token hoặc chi tiết nội bộ nên không bao giờ log. */
function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

/** Giải mã token đã lưu; lỗi (đổi khoá, dữ liệu hỏng) trả null và chỉ log tên lỗi. */
function tryDecrypt(decrypt: (payload: string) => string, encrypted: string, userId: string): string | null {
  try {
    return decrypt(encrypted);
  } catch (error: unknown) {
    console.error("[auth/disconnect] Không giải mã được token Google", { userId, error: errorName(error) });
    return null;
  }
}

type DisconnectModules = [
  typeof import("@/server/db"),
  typeof import("@/server/google/revoke"),
  typeof import("@/server/crypto"),
];

/** Nạp module và đọc Account google; lỗi (nạp module, DB) trả null và chỉ log tên lỗi. */
async function loadGoogleAccount(userId: string) {
  try {
    const modules: DisconnectModules = await Promise.all([
      import("@/server/db"),
      import("@/server/google/revoke"),
      import("@/server/crypto"),
    ]);
    const account = await modules[0].prisma.account.findFirst({
      where: { userId, provider: "google" },
      orderBy: GOOGLE_ACCOUNT_ORDER,
      select: { providerAccountId: true, refresh_token: true, access_token: true },
    });
    return { modules, account };
  } catch (error: unknown) {
    console.error("[auth/disconnect] Không đọc được Account Google", { userId, error: errorName(error) });
    return null;
  }
}

/**
 * Thu hồi quyền Google của user rồi xoá token trong Account google; trả `DisconnectOutcome`.
 * - Thu hồi thành công / token đã hết hiệu lực / Account không còn token → xoá DB, "disconnected".
 * - Có token nhưng không giải mã được (đổi khoá, dữ liệu hỏng) → không thu hồi được ở Google, chỉ
 *   xoá khỏi DB, "disconnected-local"; người dùng cần tự gỡ quyền của app ở trang tài khoản Google.
 * - Còn lại → "failed", không đổi DB.
 * Không ném: mọi lỗi (nạp module, đọc / ghi DB) thành "failed" và chỉ log `{ userId, error: error.name }`.
 * Lỗi ghi DB cũng thành "failed" (không để lan ra) để người dùng thấy thông báo "thử lại" thay vì
 * trang lỗi; bấm lại thì Google trả invalid_token → already-invalid → ghi lại được.
 */
async function revokeAndClearGoogleTokens(userId: string): Promise<DisconnectOutcome> {
  const loaded = await loadGoogleAccount(userId);
  if (!loaded?.account) return "failed";
  const { account } = loaded;
  const [{ prisma }, { selectRevokeToken, revokeGoogleToken, buildDisconnectedAccountUpdate }, { decrypt }] =
    loaded.modules;

  const encrypted = selectRevokeToken(account);
  const token = encrypted ? tryDecrypt(decrypt, encrypted, userId) : null;
  if (token) {
    const result = await revokeGoogleToken(token);
    if (result === "failed") return "failed";
  }
  const outcome: DisconnectOutcome = encrypted && !token ? "disconnected-local" : "disconnected";

  try {
    await prisma.account.update({
      where: { provider_providerAccountId: { provider: "google", providerAccountId: account.providerAccountId } },
      data: buildDisconnectedAccountUpdate(),
    });
    return outcome;
  } catch (error: unknown) {
    console.error("[auth/disconnect] Không ghi được trạng thái đã ngắt kết nối", { userId, error: errorName(error) });
    return "failed";
  }
}

/**
 * Ngắt kết nối Google Drive: thu hồi quyền ở Google (`oauth2.googleapis.com/revoke`) rồi xoá token
 * trong Account. Lưu ý: Google không thu hồi riêng một scope, nên việc này xoá **mọi** quyền của app
 * trên tài khoản Google đó (Drive, Calendar khi có, ở mọi thiết bị). Phiên Taskeo giữ nguyên.
 * - Demo / cấu hình thiếu → "/"; chưa đăng nhập → "/login".
 * - Ưu tiên refresh token, không có thì access token; giải mã ngay trước khi gửi, không log token.
 * - Thu hồi thành công hoặc token đã hết hiệu lực → xoá token, `scope` còn scope đăng nhập.
 *   Account không còn token → coi như đã ngắt (không gọi Google). Token không giải mã được → không
 *   thu hồi được ở Google, chỉ xoá khỏi DB. Lỗi khác hoặc không có Account google → không đổi DB.
 * - Về trang cũ (`redirectTo`, chỉ đường dẫn nội bộ) kèm `?drive=disconnected` (đã thu hồi),
 *   `?drive=disconnected-local` (chỉ xoá DB, cần gỡ quyền ở trang tài khoản Google) hoặc
 *   `?drive=disconnect-failed`.
 */
export async function disconnectGoogleDrive(formData: FormData) {
  const user = await getApiUserId();
  if (!user.ok) redirect(user.status === 401 ? "/login" : "/");

  const outcome = await revokeAndClearGoogleTokens(user.userId);

  refresh();
  // redirect ném NEXT_REDIRECT nên phải nằm ngoài mọi try/catch.
  redirect(withQueryParam(formData.get("redirectTo"), "drive", DRIVE_NOTICE_BY_OUTCOME[outcome]));
}

export async function signOutAction() {
  if (!isAuthConfigured()) redirect("/login");
  const { signOut } = await import("@/server/auth/auth");
  await signOut({ redirectTo: "/login" });
}
