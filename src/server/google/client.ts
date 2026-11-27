import "server-only";
import { google, type Auth } from "googleapis";
import { prisma } from "@/server/db";
import { decrypt, encrypt } from "@/server/crypto";
import { GOOGLE_ACCOUNT_ORDER } from "./granted-scopes";

export class GoogleNotConnectedError extends Error {
  constructor() {
    super("Tài khoản chưa kết nối Google hoặc thiếu refresh token. Hãy đăng nhập lại.");
    this.name = "GoogleNotConnectedError";
  }
}

/**
 * Timeout (ms) cho mỗi request HTTP của OAuth2 client, gồm cả request refresh token.
 * Lưu ý: google-auth-library vẫn tự retry request refresh, nên timeout áp lên từng lần thử;
 * hạn tổng do nơi gọi đặt.
 */
export const GOOGLE_HTTP_TIMEOUT_MS = 10_000;

/**
 * Lưu token mới mỗi khi thư viện tự refresh (access token sống khoảng 1 giờ).
 * Chỉ ghi khi dòng Account vẫn còn refresh_token: nếu người dùng đã ngắt kết nối Drive
 * (T012 xoá token về null) trong lúc refresh đang chạy, không ghi token / scope ngược lại.
 * 0 dòng được cập nhật là hợp lệ, không phải lỗi.
 */
async function persistTokens(providerAccountId: string, tokens: Auth.Credentials) {
  await prisma.account.updateMany({
    where: { provider: "google", providerAccountId, refresh_token: { not: null } },
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
  // Cùng thứ tự với granted-scopes.ts: token và scope luôn đọc từ cùng một dòng Account.
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    orderBy: GOOGLE_ACCOUNT_ORDER,
  });
  if (!account?.refresh_token) throw new GoogleNotConnectedError();

  const client = new google.auth.OAuth2({
    clientId: process.env.AUTH_GOOGLE_ID,
    clientSecret: process.env.AUTH_GOOGLE_SECRET,
    transporterOptions: { timeout: GOOGLE_HTTP_TIMEOUT_MS },
  });
  client.setCredentials({
    access_token: account.access_token ? decrypt(account.access_token) : undefined,
    refresh_token: decrypt(account.refresh_token),
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
  });

  client.on("tokens", (tokens) => {
    persistTokens(account.providerAccountId, tokens).catch((error: unknown) => {
      // Chỉ log error.name: message của Prisma / gaxios có thể chứa dữ liệu nhạy cảm.
      console.error("Không lưu được token Google đã refresh", {
        userId,
        error: error instanceof Error ? error.name : "unknown",
      });
    });
  });

  return client;
}
