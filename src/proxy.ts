import { NextResponse, type NextRequest } from "next/server";
import { AUTH_SESSION_COOKIE_NAMES } from "@/config/auth-cookies";
import { getAuthMode } from "@/config/env";

// Kiểm tra lạc quan: chưa có cookie phiên của Auth.js thì chuyển về /login.
// Kiểm tra thật nằm ở getViewer() và ở từng API route (auth()).
// Chế độ demo (chỉ ở development, không có biến auth nào) bỏ qua; cấu hình thiếu thì luôn về /login
// (ở development trang đó liệt kê biến còn thiếu). Ở production thiếu biến luôn là misconfigured.
export function proxy(request: NextRequest) {
  const mode = getAuthMode();
  if (mode === "demo") return NextResponse.next();
  const hasSession = AUTH_SESSION_COOKIE_NAMES.some((name) => request.cookies.has(name));
  if (mode === "configured" && hasSession) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  // Bỏ qua trang đăng nhập, API, file tĩnh của Next và favicon.
  matcher: ["/((?!login|api|_next/static|_next/image|favicon.ico).*)"],
};
