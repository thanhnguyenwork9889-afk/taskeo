"use server";

import { redirect } from "next/navigation";
import { buildIncrementalAuthorizationParams } from "@/server/auth/google-tokens";
import { toSafeRedirectPath } from "@/server/auth/redirect-path";
import { getApiUserId, isAuthConfigured } from "@/server/auth/session";
import { GOOGLE_SCOPES } from "@/server/google/scopes";

export async function signInWithGoogle() {
  if (!isAuthConfigured()) redirect("/");
  const { signIn } = await import("@/server/auth/auth");
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

export async function signOutAction() {
  if (!isAuthConfigured()) redirect("/login");
  const { signOut } = await import("@/server/auth/auth");
  await signOut({ redirectTo: "/login" });
}
