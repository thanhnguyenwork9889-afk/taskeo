import "server-only";
import { google, type Auth } from "googleapis";
import { prisma } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";

export class GoogleNotConnectedError extends Error {
  constructor() {
    super("Tài khoản chưa kết nối Google hoặc thiếu refresh token. Hãy đăng nhập lại.");
    this.name = "GoogleNotConnectedError";
  }
}

/** Lưu token mới mỗi khi thư viện tự refresh (access token sống khoảng 1 giờ). */
async function persistTokens(providerAccountId: string, tokens: Auth.Credentials) {
  await prisma.account.update({
    where: { provider_providerAccountId: { provider: "google", providerAccountId } },
    data: {
      ...(tokens.access_token ? { access_token: encrypt(tokens.access_token) } : {}),
      ...(tokens.refresh_token ? { refresh_token: encrypt(tokens.refresh_token) } : {}),
      ...(tokens.expiry_date ? { expires_at: Math.floor(tokens.expiry_date / 1000) } : {}),
      ...(tokens.scope ? { scope: tokens.scope } : {}),
    },
  });
}

/**
 * OAuth2 client của Google theo user, chỉ dùng phía server.
 * googleapis tự refresh access token khi hết hạn; sự kiện "tokens" lưu token mới vào DB.
 */
export async function getGoogleAuth(userId: string) {
  const account = await prisma.account.findFirst({ where: { userId, provider: "google" } });
  if (!account?.refresh_token) throw new GoogleNotConnectedError();

  const client = new google.auth.OAuth2(process.env.AUTH_GOOGLE_ID, process.env.AUTH_GOOGLE_SECRET);
  client.setCredentials({
    access_token: account.access_token ? decrypt(account.access_token) : undefined,
    refresh_token: decrypt(account.refresh_token),
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
  });

  client.on("tokens", (tokens) => {
    persistTokens(account.providerAccountId, tokens).catch((error: unknown) => {
      console.error("Không lưu được token Google đã refresh", { userId, message: error instanceof Error ? error.message : "unknown" });
    });
  });

  return client;
}
