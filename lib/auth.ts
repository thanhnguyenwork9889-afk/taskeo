import "server-only";
import NextAuth, { type Account } from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter, AdapterAccount } from "next-auth/adapters";
import { prisma } from "@/lib/db";
import { encryptOptional } from "@/lib/crypto";

// Giai đoạn 1 chỉ xin scope đăng nhập. Drive / Calendar / Gmail xin thêm ở giai đoạn sau
// (incremental authorization), xem lib/google/scopes.ts.
const LOGIN_SCOPES = "openid email profile";

/** Bọc adapter chuẩn để token Google luôn được mã hoá trước khi ghi vào bảng Account. */
function withEncryptedTokens(adapter: Adapter): Adapter {
  return {
    ...adapter,
    linkAccount: (account: AdapterAccount) =>
      adapter.linkAccount!({
        ...account,
        access_token: encryptOptional(account.access_token) ?? undefined,
        refresh_token: encryptOptional(account.refresh_token) ?? undefined,
        id_token: encryptOptional(account.id_token) ?? undefined,
      }),
  };
}

/**
 * Auth.js chỉ ghi bảng Account ở lần đăng nhập đầu (linkAccount). Khi đăng nhập lại với
 * prompt=consent, Google cấp token mới; lưu lại (đã mã hoá) để refresh token không bị cũ.
 */
async function persistReSignInTokens(account: Account | null) {
  if (!account || account.provider !== "google" || !account.access_token) return;
  try {
    await prisma.account.update({
      where: { provider_providerAccountId: { provider: "google", providerAccountId: account.providerAccountId } },
      data: {
        access_token: encryptOptional(account.access_token),
        ...(account.refresh_token ? { refresh_token: encryptOptional(account.refresh_token) } : {}),
        ...(account.id_token ? { id_token: encryptOptional(account.id_token) } : {}),
        ...(account.expires_at ? { expires_at: account.expires_at } : {}),
        ...(account.scope ? { scope: account.scope } : {}),
      },
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
  pages: { signIn: "/login" },
  providers: [
    Google({
      authorization: {
        params: {
          scope: LOGIN_SCOPES,
          // Bắt buộc để Google trả refresh token ở lần đăng nhập đầu.
          access_type: "offline",
          prompt: "consent",
          include_granted_scopes: "true",
        },
      },
    }),
  ],
});
