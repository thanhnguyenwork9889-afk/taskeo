import { NextResponse, type NextRequest } from "next/server";
import { getAuthMode } from "@/config/env";

// Kiểm tra lạc quan: chưa có cookie phiên của Auth.js thì chuyển về /login.
// Kiểm tra thật nằm ở getViewer() và ở từng API route (auth()).
// Chế độ demo (chỉ ở development, không có biến auth nào) bỏ qua; cấu hình thiếu thì luôn về /login
// (trang đó báo thiếu biến nào). Ở staging / production thiếu biến luôn là misconfigured.
const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];

export function proxy(request: NextRequest) {
  const mode = getAuthMode();
  if (mode === "demo") return NextResponse.next();
  const hasSession = SESSION_COOKIES.some((name) => request.cookies.has(name));
  if (mode === "configured" && hasSession) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  // Bỏ qua trang đăng nhập, API, file tĩnh của Next và favicon.
  matcher: ["/((?!login|api|_next/static|_next/image|favicon.ico).*)"],
};
