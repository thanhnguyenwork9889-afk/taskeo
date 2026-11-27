// Scope theo từng giai đoạn của kế hoạch. Trước giai đoạn 3–4, đối chiếu lại phân loại
// (non-sensitive / sensitive / restricted) trên Google Cloud Console.
export const GOOGLE_SCOPES = {
  drive: "https://www.googleapis.com/auth/drive.file", // giai đoạn 3
  calendarRead: "https://www.googleapis.com/auth/calendar.readonly", // giai đoạn 4
  calendarEvents: "https://www.googleapis.com/auth/calendar.events", // giai đoạn 4, tuỳ chọn
} as const;

/**
 * Scope đăng nhập đúng dạng Google trả về và Auth.js lưu trong `Account.scope`.
 * Tham số request dùng dạng rút gọn "openid email profile", nhưng Google chuẩn hoá thành URL đầy đủ
 * `userinfo.email` / `userinfo.profile` khi trả token; so sánh với `Account.scope` phải dùng dạng này.
 * Dùng khi ngắt kết nối Google: ghi lại scope chỉ còn phần đăng nhập, bỏ mọi scope Google API.
 */
export const GOOGLE_SIGN_IN_GRANTED_SCOPE =
  "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile";

export type GoogleScope =(typeof GOOGLE_SCOPES)[keyof typeof GOOGLE_SCOPES];

/** Account.scope là chuỗi các scope cách nhau bởi khoảng trắng; bỏ khoảng trắng thừa và chuỗi rỗng. */
export function parseScopes(grantedScopes: string | null | undefined): string[] {
  return (grantedScopes ?? "").split(/\s+/).filter((scope) => scope.length > 0);
}

/** So khớp nguyên scope, không khớp chuỗi con hay tiền tố. */
export function hasScope(grantedScopes: string | null | undefined, scope: GoogleScope): boolean {
  return parseScopes(grantedScopes).includes(scope);
}
