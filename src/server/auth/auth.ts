import "server-only";
import NextAuth, { type Account } from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter, AdapterAccount } from "next-auth/adapters";
import { prisma } from "@/server/db";
import { sessionWithUserId } from "@/server/auth/session-callback";
import {
  GOOGLE_AUTHORIZATION_PARAMS,
  buildReSignInTokenUpdate,
  encryptAdapterAccountTokens,
} from "@/server/auth/google-tokens";

/** Bọc adapter chuẩn để token Google luôn được mã hoá trước khi ghi vào bảng Account. */
function withEncryptedTokens(adapter: Adapter): Adapter {
  return {
    ...adapter,
    linkAccount: (account: AdapterAccount) => adapter.linkAccount!(encryptAdapterAccountTokens(account)),
  };
}

/**
 * Auth.js chỉ ghi bảng Account ở lần đăng nhập đầu (linkAccount). Khi đăng nhập lại với
 * prompt=consent, Google cấp token mới; lưu lại (đã mã hoá) để refresh token không bị cũ.
 */
async function persistReSignInTokens(account: Account | null) {
  const data = buildReSignInTokenUpdate(account);
  if (!account || !data) return;
  try {
    await prisma.account.update({
      where: { provider_providerAccountId: { provider: "google", providerAccountId: account.providerAccountId } },
      data,
    });
  } catch (error: unknown) {
    console.error("Không lưu được token Google khi đăng nhập lại", { message: error instanceof Error ? error.message : "unknown" });
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: withEncryptedTokens(PrismaAdapter(prisma)),
  events: {
    signIn: ({ account, isNewUser }) => (isNewUser ? undefined : persistReSignInTokens(account ?? null)),
  },
  session: { strategy: "database" },
  callbacks: {
    // Chỉ name/email/image/expires + id; không đưa token, sessionToken hay dữ liệu Account vào phiên (phiên có thể tới client).
    session: sessionWithUserId,
  },
  pages: { signIn: "/login" },
  providers: [
    Google({
      // Chỉ scope đăng nhập + offline/consent; lý do xem google-tokens.ts.
      authorization: { params: GOOGLE_AUTHORIZATION_PARAMS },
    }),
  ],
});
