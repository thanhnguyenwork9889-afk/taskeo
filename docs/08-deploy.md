# 08 · Deploy lên Vercel

Checklist dựng staging và production lần đầu (nhiệm vụ T003). Ba môi trường và biến của từng môi trường: [01-environment.md](01-environment.md#ba-môi-trường).

| | staging | production |
|---|---|---|
| Vercel | Preview, nhánh `develop` | Production, nhánh `main` |
| Domain | `<domain-staging>` (alias cố định gán cho nhánh `develop`) | `<domain-production>` (domain chính của project) |
| Neon | branch `staging` | branch `main` |
| OAuth client | `Taskeo Staging` | `Taskeo` |
| Mẫu biến | `.env.staging.example` | `.env.production.example` |

Mỗi môi trường dùng **secret riêng**: không chép `AUTH_SECRET`, `TOKEN_ENCRYPTION_KEY`, OAuth client hay chuỗi database từ môi trường này sang môi trường khác.

## 1. Tạo project trên Vercel

1. Vercel → **Add New → Project** → Import repo GitHub của Taskeo. Framework: Next.js (tự nhận). Root Directory, Build / Install Command: để mặc định (`npm install` tự chạy `prisma generate` qua `postinstall`).
2. Bấm Deploy luôn, chưa cần biến. Bản đầu build từ `main` và sẽ **chặn truy cập** (chế độ `misconfigured`) — đúng như mong đợi.
3. **Settings → Git → Production Branch** = `main`.
4. **Settings → Build and Deployment → Node.js Version** = `24.x` (khớp `engines` trong `package.json`).
5. **Settings → Environment Variables**: kiểm tra *Automatically expose System Environment Variables* đang bật.

## 2. Chốt domain

1. **Settings → Domains**: domain production là domain `*.vercel.app` Vercel đã cấp (đổi tên được nếu còn trống, ví dụ `taskeo.vercel.app`).
2. Thêm một domain `*.vercel.app` cho staging (ví dụ `taskeo-staging.vercel.app`), mục *Git Branch* chọn `develop`. Alias này luôn trỏ tới bản deploy mới nhất của `develop`.
3. Ghi lại hai domain: chúng là `<domain-production>` và `<domain-staging>` trong các bước sau.

URL ngẫu nhiên theo từng commit (`taskeo-abc123-….vercel.app`) **không đăng nhập Google được** vì redirect URI phải khớp chính xác. Luôn dùng hai domain ở trên.

## 3. Tạo OAuth client trên Google Cloud

Google Cloud Console → **APIs & Services → Credentials → Create Credentials → OAuth client ID**, loại *Web application*. Tạo hai client:

| Tên | Authorized redirect URI |
|---|---|
| `Taskeo Staging` | `https://<domain-staging>/api/auth/callback/google` |
| `Taskeo` | `https://<domain-production>/api/auth/callback/google` |

Không cần *Authorized JavaScript origins*. Ghi lại Client ID / Secret của từng client. Consent screen đang ở chế độ Testing: chỉ test user đăng nhập được, refresh token hết hạn sau 7 ngày (hết khi làm T71).

## 4. Đặt biến môi trường trên Vercel

**Settings → Environment Variables.** Tạo secret mới cho từng môi trường (chạy hai lần, mỗi lần một giá trị khác):

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Dùng cho `AUTH_SECRET` và `TOKEN_ENCRYPTION_KEY`. Không dùng `npx auth secret` ở đây: lệnh đó ghi vào `.env.local` của máy dev.

| Biến | Production (Environment = Production) | Staging (Environment = Preview, Branch = `develop`) |
|---|---|---|
| `NEXT_PUBLIC_APP_ENV` | `production` | `staging` |
| `DATABASE_URL` | Neon `main`, chuỗi có pooling | Neon `staging`, chuỗi có pooling |
| `DIRECT_URL` | Neon `main`, chuỗi trực tiếp | Neon `staging`, chuỗi trực tiếp |
| `AUTH_SECRET` | secret mới | secret mới khác |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | client `Taskeo` | client `Taskeo Staging` |
| `TOKEN_ENCRYPTION_KEY` | khoá mới | khoá mới khác |

- Đánh dấu *Sensitive* cho mọi biến trừ `NEXT_PUBLIC_APP_ENV`.
- Biến Preview chỉ gán cho nhánh `develop`: preview của nhánh nhiệm vụ không có biến nên bị chặn truy cập. Đó là chủ ý.
- Không cần `AUTH_URL` / `AUTH_TRUST_HOST`: Auth.js tự tin host khi chạy trên Vercel.
- `TOKEN_ENCRYPTION_KEY` production mất là không giải mã được token đã lưu: cất thêm một bản ở trình quản lý mật khẩu (quy trình đầy đủ ở T74).

## 5. Áp migration lên Neon `staging` và `main`

Chạy trên máy, **mỗi môi trường một cửa sổ PowerShell mới**, đóng ngay sau khi xong để chuỗi kết nối không sót lại trong shell:

```powershell
$env:DATABASE_URL = "<chuỗi có pooling của branch>"
$env:DIRECT_URL = "<chuỗi trực tiếp của branch>"
npm run db:deploy
npx prisma migrate status
```

`migrate status` phải báo *Database schema is up to date*. `db:deploy` (`prisma migrate deploy`) chỉ áp migration đã có trong repo, không tạo migration mới, không xoá dữ liệu. Chi tiết: [03-database.md](03-database.md#mỗi-môi-trường-một-database).

## 6. Deploy lại và kiểm tra

Biến `NEXT_PUBLIC_*` được nhúng lúc build, nên phải build lại sau khi đặt biến:

- Staging: **Deployments → Create Deployment** → nhánh `develop` (hoặc push lên `develop`).
- Production: **Redeploy** bản mới nhất của `main` (hoặc khi release `develop` → `main`).

Kiểm tra từng domain:

1. Mở `https://<domain>`: tiêu đề tab là `Taskeo · Staging` (staging) hoặc `Taskeo` (production).
2. `/login` hiện nút đăng nhập Google, không phải thông báo chặn truy cập. Nếu bị chặn: thiếu biến ở đúng Environment / Branch, hoặc chưa build lại.
3. Bấm đăng nhập: trình duyệt sang `accounts.google.com`, tham số `redirect_uri` là `https://<domain>/api/auth/callback/google`, Google không báo `redirect_uri_mismatch`.

## Về sau

- Migrate tự động khi deploy: T67. Hiện tại mỗi lần có migration mới phải chạy bước 5 trước khi deploy.
- Domain riêng + consent screen In production: T71. Đổi domain thì thêm redirect URI mới vào client tương ứng.
- Merge qua Pull Request, Vercel Preview cho mỗi PR: T72.
