import "server-only";
import { prisma } from "@/server/db";
import { GOOGLE_SCOPES, hasScope, type GoogleScope } from "./scopes";

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
    select: { scope: true },
  });
  return account?.scope ?? null;
}

export async function getGrantedGoogleScopes(userId: string): Promise<string[]> {
  const granted = await readGrantedScopeString(userId);
  return (granted ?? "").split(/\s+/).filter((scope) => scope.length > 0);
}

export async function hasGoogleScope(userId: string, scope: GoogleScope): Promise<boolean> {
  return hasScope(await readGrantedScopeString(userId), scope);
}

export async function requireGoogleScope(userId: string, scope: GoogleScope): Promise<void> {
  if (!(await hasGoogleScope(userId, scope))) {
    throw new GoogleScopeMissingError(scope);
  }
}
