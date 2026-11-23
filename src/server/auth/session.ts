import "server-only";
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
 * - Demo (không có biến auth nào): người dùng mẫu.
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
