import "server-only";
import { prisma } from "@/server/db";
import { GOOGLE_SCOPES, hasScope, parseScopes, type GoogleScope } from "./scopes";

/**
 * Thứ tự chọn Account Google khi một user có nhiều dòng (ví dụ chọn nhầm tài khoản lúc kết nối):
 * luôn lấy tài khoản liên kết đầu tiên, tức tài khoản đăng nhập gốc. Dùng chung cho đọc scope
 * và đọc token (client.ts) để hai bên không bao giờ đọc từ hai dòng khác nhau.
 */
export const GOOGLE_ACCOUNT_ORDER = { createdAt: "asc" } as const;

const SCOPE_LABELS: Record<GoogleScope, string> = {
  [GOOGLE_SCOPES.drive]: "Google Drive",
  [GOOGLE_SCOPES.calendarRead]: "Google Calendar",
  [GOOGLE_SCOPES.calendarEvents]: "Google Calendar",
};

/** Người dùng chưa cấp scope cần thiết; UI nên mời kết nối lại (incremental authorization). */
export class GoogleScopeMissingError extends Error {
  readonly scope: GoogleScope;

  constructor(scope: GoogleScope) {
    super(`Chưa cấp quyền ${SCOPE_LABELS[scope]}. Hãy kết nối lại.`);
    this.name = "GoogleScopeMissingError";
    this.scope = scope;
  }
}

/** Chuỗi Account.scope thô của tài khoản Google của user, hoặc null. Không bao giờ trả ra client. */
async function readGrantedScopeString(userId: string): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    orderBy: GOOGLE_ACCOUNT_ORDER,
    select: { scope: true },
  });
  return account?.scope ?? null;
}

export async function getGrantedGoogleScopes(userId: string): Promise<string[]> {
  const granted = await readGrantedScopeString(userId);
  return parseScopes(granted);
}

export async function hasGoogleScope(userId: string, scope: GoogleScope): Promise<boolean> {
  return hasScope(await readGrantedScopeString(userId), scope);
}

export async function requireGoogleScope(userId: string, scope: GoogleScope): Promise<void> {
  if (!(await hasGoogleScope(userId, scope))) {
    throw new GoogleScopeMissingError(scope);
  }
}
