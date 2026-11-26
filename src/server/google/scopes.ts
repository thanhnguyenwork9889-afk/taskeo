// Scope theo từng giai đoạn của kế hoạch. Trước giai đoạn 3–4, đối chiếu lại phân loại
// (non-sensitive / sensitive / restricted) trên Google Cloud Console.
export const GOOGLE_SCOPES = {
  drive: "https://www.googleapis.com/auth/drive.file", // giai đoạn 3
  calendarRead: "https://www.googleapis.com/auth/calendar.readonly", // giai đoạn 4
  calendarEvents: "https://www.googleapis.com/auth/calendar.events", // giai đoạn 4, tuỳ chọn
} as const;

export type GoogleScope = (typeof GOOGLE_SCOPES)[keyof typeof GOOGLE_SCOPES];

/** Account.scope là chuỗi các scope cách nhau bởi khoảng trắng; bỏ khoảng trắng thừa và chuỗi rỗng. */
export function parseScopes(grantedScopes: string | null | undefined): string[] {
  return (grantedScopes ?? "").split(/\s+/).filter((scope) => scope.length > 0);
}

/** So khớp nguyên scope, không khớp chuỗi con hay tiền tố. */
export function hasScope(grantedScopes: string | null | undefined, scope: GoogleScope): boolean {
  return parseScopes(grantedScopes).includes(scope);
}
