# 02 · Google Cloud (Giai đoạn 0)

1. Tạo project trên Google Cloud Console.
2. **OAuth consent screen**: loại External, trạng thái Testing.
3. **APIs & Services → Credentials → OAuth Client ID** (loại Web application). Tạo **một client cho mỗi môi trường** (`Taskeo Dev`, `Taskeo`) để lộ secret của môi trường này không ảnh hưởng môi trường khác.
4. Redirect URI theo môi trường:

   | Môi trường | Authorized redirect URI |
   |---|---|
   | development | `http://localhost:3000/api/auth/callback/google` |
   | production | `https://taskeo-zeta.vercel.app/api/auth/callback/google` |

   URL preview ngẫu nhiên của Vercel cho từng commit không đăng nhập Google được; dùng domain cố định của nhánh.
5. Điền Client ID / Secret vào `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`: development trong `.env.local`, production trên Vercel (xem [01-environment.md](01-environment.md#hai-môi-trường), [08-deploy.md](08-deploy.md)).

## Đăng nhập giai đoạn 1

Cấu hình ở `src/server/auth/auth.ts`; tham số nằm trong `GOOGLE_AUTHORIZATION_PARAMS` (`src/server/auth/google-tokens.ts`).

| Tham số | Giá trị | Vì sao |
|---|---|---|
| `scope` | `openid email profile` | Chỉ xin quyền đăng nhập; Drive / Calendar xin sau (xem dưới) |
| `access_type` | `offline` | Google trả refresh token để server gọi API khi người dùng không có mặt |
| `prompt` | `consent` | Google chỉ trả refresh token ở lần đồng ý đầu; bắt hiện màn đồng ý mỗi lần để luôn có refresh token mới |
| `include_granted_scopes` | `true` | Giữ các scope đã cấp khi xin thêm scope sau này |

- Lần đăng nhập đầu: Auth.js gọi `linkAccount`, token được mã hoá trước khi ghi bảng `Account`.
- Đăng nhập lại: Auth.js không ghi lại `Account`; `events.signIn` cập nhật token mới (đã mã hoá), chỉ ghi field Google trả về.
- `src/server/google/client.ts` dùng refresh token để lấy access token mới (sống khoảng 1 giờ) và lưu lại (đã mã hoá).
- Consent screen đang ở **Testing**: refresh token hết hạn sau 7 ngày, phải đăng nhập lại (hết khi chuyển In production, sheet T71).

Kiểm tra token đã lưu mã hoá (chỉ chạy với `.env.local` trỏ DB dev; chỉ xem tiền tố, không in giá trị token):

```bash
node --env-file=.env.local -e 'const {PrismaClient}=require("@prisma/client");const p=new PrismaClient();p.account.findMany({where:{provider:"google"},select:{refresh_token:true,access_token:true,scope:true}}).then(a=>console.log(a.map(x=>({refresh:(x.refresh_token||"").startsWith("v1:"),access:(x.access_token||"").startsWith("v1:"),scope:x.scope})))).finally(()=>p.$disconnect())'
```

Cả `refresh` và `access` phải là `true`.

## Scope theo giai đoạn

Khai báo ở `src/server/google/scopes.ts`. Đăng nhập lần đầu chỉ xin scope cơ bản; scope Drive / Calendar xin thêm khi cần (incremental authorization).

| Scope | Giai đoạn |
|---|---|
| `drive.file` | 3 |
| `calendar.readonly` | 4 |
| `calendar.events` | 4 (tuỳ chọn) |

Trước giai đoạn 3–4, đối chiếu lại phân loại (non-sensitive / sensitive / restricted) trên Google Cloud Console.

### Xin thêm `drive.file` (T010)

Việc trên Google Cloud Console (làm một lần, cho từng client / môi trường):

1. **OAuth consent screen → Data Access → Add or remove scopes**, thêm `https://www.googleapis.com/auth/drive.file`, lưu.
2. Consent screen đang ở Testing: tài khoản dùng thử phải có trong **Test users**.

Luồng trong app:

- Người dùng đã đăng nhập thấy nút **Kết nối Google Drive** ở đáy sidebar (`src/components/layout/sidebar.tsx`); đã cấp thì hiện "Đã kết nối Google Drive". Chế độ demo không hiện.
- Nút gửi form tới server action `connectGoogleDrive` (`src/server/auth/actions.ts`): gọi `signIn("google", { redirectTo }, params)` với `params = buildIncrementalAuthorizationParams([drive])` (`src/server/auth/google-tokens.ts`).
  - Tham số thứ ba của `signIn` **thay hẳn** `scope` của provider, nên `scope` gửi đi là `openid email profile …/drive.file`; `access_type=offline`, `prompt=consent`, `include_granted_scopes=true` giữ như đăng nhập.
  - `login_hint` = email trong phiên, để Google chọn sẵn đúng tài khoản (chọn tài khoản khác sẽ bị chặn, xem dưới).
  - `redirectTo` lấy từ form, chỉ nhận đường dẫn nội bộ (`toSafeRedirectPath`, `src/server/auth/redirect-path.ts`), ngược lại về `/`.
- Google quay lại → `events.signIn` (người dùng đã có account) ghi token mới đã mã hoá và `Account.scope` mới.
- Server kiểm quyền bằng `hasGoogleScope` / `requireGoogleScope` (`src/server/google/granted-scopes.ts`, ném `GoogleScopeMissingError`); `getViewer()` trả `driveConnected` (chỉ boolean, chuỗi scope không ra client).
- **Granular consent:** người dùng có thể bỏ tick ô Drive ở màn đồng ý → `Account.scope` không có `drive.file`, nút vẫn hiện, không lỗi.
- **Chọn nhầm tài khoản (T011):** một user chỉ có một tài khoản Google. Nếu đang đăng nhập mà người dùng chọn một tài khoản Google khác chưa liên kết, callback `signIn` (`guardSignIn`, `src/server/auth/`) từ chối trước khi Auth.js gắn tài khoản: không ghi gì vào DB, chuyển về `/?drive=wrong-account`, app hiện thông báo "Bạn đã chọn tài khoản Google khác…" rồi bỏ tham số khỏi URL. DB có thêm ràng buộc `@@unique([userId, provider])` trên `Account` ([03-database.md](03-database.md)).
  - Callback đọc phiên từ cookie (`__Secure-authjs.session-token` / `authjs.session-token`) và bảng `Session`, không dùng `auth()`: `auth()` trả "không có phiên" khi DB lỗi, sẽ thành "cho qua". Lỗi DB trong callback → trang lỗi mặc định của Auth.js (`AccessDenied`).
  - Google vẫn ghi nhận người dùng đã đồng ý cho tài khoản bị từ chối; app không lưu token nào của tài khoản đó. Người dùng có thể gỡ quyền ở trang tài khoản Google nếu muốn.

## Bảo mật token

- Token Google được mã hoá AES-256-GCM (`src/server/crypto.ts`) trước khi ghi DB, bằng cách bọc `linkAccount` của Prisma adapter.
- Client không cầm token. Ngoại lệ có chủ đích: Google Picker (giai đoạn 3) chạy trên trình duyệt nên cần một route trả access token ngắn hạn chỉ có scope `drive.file`.
