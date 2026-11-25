import "server-only";
import type { DefaultSession, Session } from "next-auth";

declare module "next-auth" {
  interface Session {
    // Session strategy "database": callbacks.session gắn id người dùng để server lọc dữ liệu theo userId.
    user: { id: string } & DefaultSession["user"];
  }
}

interface SessionProfile {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

/** Phần tham số callbacks.session (strategy "database") mà hàm này cần đọc. */
export interface SessionCallbackInput {
  session: { expires: Date | string; user?: SessionProfile | null };
  user: { id: string };
}

/**
 * Dựng phiên trả về từ callbacks.session. Chỉ chọn từng field cho phép: với strategy
 * "database", Auth.js truyền vào `session` gồm cả sessionToken, userId và toàn bộ
 * AdapterUser (emailVerified…). Spread nguyên object sẽ đưa chúng ra client qua
 * /api/auth/session, nên không spread.
 */
export function sessionWithUserId({ session, user }: SessionCallbackInput): Session {
  const profile = session.user ?? {};
  return {
    user: {
      id: user.id,
      name: profile.name ?? null,
      email: profile.email ?? null,
      image: profile.image ?? null,
    },
    expires: session.expires instanceof Date ? session.expires.toISOString() : session.expires,
  };
}
