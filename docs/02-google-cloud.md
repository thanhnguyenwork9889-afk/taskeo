# 02 · Google Cloud (Giai đoạn 0)

1. Tạo project trên Google Cloud Console.
2. **OAuth consent screen**: loại External, trạng thái Testing.
3. **APIs & Services → Credentials → OAuth Client ID** (loại Web application).
4. Redirect URI:
   - `http://localhost:3000/api/auth/callback/google`
   - và domain Vercel khi deploy.
5. Điền Client ID / Secret vào `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` trong `.env.local`.

## Scope theo giai đoạn

Khai báo ở `src/server/google/scopes.ts`. Đăng nhập lần đầu chỉ xin scope cơ bản; scope Drive / Calendar xin thêm khi cần (incremental authorization).

| Scope | Giai đoạn |
|---|---|
| `drive.file` | 3 |
| `calendar.readonly` | 4 |
| `calendar.events` | 4 (tuỳ chọn) |

Trước giai đoạn 3–4, đối chiếu lại phân loại (non-sensitive / sensitive / restricted) trên Google Cloud Console.

## Bảo mật token

- Token Google được mã hoá AES-256-GCM (`src/server/crypto.ts`) trước khi ghi DB, bằng cách bọc `linkAccount` của Prisma adapter.
- Client không cầm token. Ngoại lệ có chủ đích: Google Picker (giai đoạn 3) chạy trên trình duyệt nên cần một route trả access token ngắn hạn chỉ có scope `drive.file`.
