import "server-only";
import { connection } from "next/server";
import { getAuthMode, missingAuthEnvVars } from "@/config/env";

export interface Viewer {
  name: string;
  email: string | null;
  image: string | null;
  isDemo: boolean;
}

const DEMO_VIEWER: Viewer = { name: "Bạn", email: null, image: null, isDemo: true };

/** Đủ biến môi trường để bật đăng nhập Google thật hay chưa. */
export function isAuthConfigured(): boolean {
  return getAuthMode() === "configured";
}

/**
 * Người dùng hiện tại.
 * - Demo (chỉ ở development, không có biến auth nào): người dùng mẫu.
 * - Đã cấu hình: null nếu chưa đăng nhập.
 * - Cấu hình thiếu: trả null (bị chặn) thay vì lặng lẽ rơi về demo.
 */
export async function getViewer(): Promise<Viewer | null> {
  const mode = getAuthMode();
  if (mode === "demo") return DEMO_VIEWER;
  if (mode === "misconfigured") {
    console.error("Cấu hình đăng nhập thiếu biến môi trường", { missing: missingAuthEnvVars() });
    return null;
  }
  // auth() tạo CSRF token bằng crypto.getRandomValues() khi request chưa có cookie CSRF.
  // Với cacheComponents + partialPrefetching, headers() vẫn có giá trị lúc prerender nên phải
  // chặn bằng connection() (chỉ xong khi có request thật), nếu không Next báo
  // blocking-prerender-crypto ở mọi trang dùng layout (app).
  await connection();
  // Import động để chế độ demo không khởi tạo Prisma / Auth.js.
  const { auth } = await import("@/server/auth/auth");
  const session = await auth();
  if (!session?.user) return null;
  return {
    name: session.user.name ?? session.user.email ?? "Bạn",
    email: session.user.email ?? null,
    image: session.user.image ?? null,
    isDemo: false,
  };
}

export type ApiUserResult = { ok: true; userId: string } | { ok: false; status: 401 | 503 };

/**
 * Người dùng hiện tại cho API route.
 * - Demo / cấu hình thiếu: 503 (không có DB, không import Auth.js / Prisma).
 * - Đã cấu hình: 401 nếu chưa đăng nhập hoặc phiên thiếu `user.id`.
 * Lỗi từ `auth()` (ví dụ DB hỏng) không bị nuốt, để route trả 500.
 */
export async function getApiUserId(): Promise<ApiUserResult> {
  const mode = getAuthMode();
  if (mode === "demo") return { ok: false, status: 503 };
  if (mode === "misconfigured") {
    console.error("Cấu hình đăng nhập thiếu biến môi trường", { missing: missingAuthEnvVars() });
    return { ok: false, status: 503 };
  }
  const { auth } = await import("@/server/auth/auth");
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, status: 401 };
  return { ok: true, userId };
}
