# 08 · Deploy lên Vercel

Checklist dựng production lần đầu (nhiệm vụ T003). Hai môi trường và biến của từng môi trường: [01-environment.md](01-environment.md#hai-môi-trường).

| | production |
|---|---|
| Vercel | Production, nhánh `main` |
| Domain | `taskeo-zeta.vercel.app` |
| Neon | branch `main` |
| OAuth client | `Taskeo` |
| Mẫu biến | `.env.production.example` |

Production dùng **secret riêng**: không chép `AUTH_SECRET`, `TOKEN_ENCRYPTION_KEY`, OAuth client hay chuỗi database từ `.env.local` (development) sang.

Không có staging. Bản **Preview** của Vercel (mọi nhánh khác `main`) được app coi là production; nó bị chặn truy cập **vì không có biến nào** — đừng bao giờ tick Environment Preview khi đặt biến (bước 4).

## 1. Tạo project trên Vercel

1. Vercel → **Add New → Project** → Import repo GitHub của Taskeo. Framework: Next.js (tự nhận). Root Directory, Build / Install Command: để mặc định (`npm install` tự chạy `prisma generate` qua `postinstall`).
2. Bấm Deploy luôn, chưa cần biến. Bản đầu build từ `main` và sẽ **chặn truy cập** (chế độ `misconfigured`) — đúng như mong đợi.
3. **Settings → Git → Production Branch** = `main`.
4. **Settings → Build and Deployment → Node.js Version** = `24.x` (khớp `engines` trong `package.json`).
5. **Settings → Deployment Protection → Vercel Authentication**: giữ **bật** (mặc định của gói Hobby). Nó chỉ chặn bản Preview, không chặn domain production.

## 2. Domain

**Settings → Domains**: domain production là domain `*.vercel.app` Vercel cấp, đổi tên được nếu còn trống. Hiện tại: `taskeo-zeta.vercel.app`.

Đổi domain thì phải sửa redirect URI ở bước 3, Redeploy, và cập nhật domain trong docs này, `docs/01`, `docs/02`, `.env.production.example`.

URL ngẫu nhiên theo từng commit (`taskeo-abc123-….vercel.app`) **không đăng nhập Google được** vì redirect URI phải khớp chính xác.

## 3. Tạo OAuth client trên Google Cloud

Google Cloud Console → **APIs & Services → Credentials → Create Credentials → OAuth client ID**, loại *Web application*, tên `Taskeo`.

- **Authorized redirect URIs**: `https://taskeo-zeta.vercel.app/api/auth/callback/google` (đúng từng ký tự, không có `/` cuối).
- Không cần *Authorized JavaScript origins*.

Consent screen đang ở chế độ Testing: chỉ test user đăng nhập được, refresh token hết hạn sau 7 ngày (hết khi làm T71).

## 4. Đặt biến môi trường trên Vercel

**Settings → Environment Variables**, mỗi biến chỉ tick Environment = **Production**, **không** tick Preview / Development. Preview được app coi là production: tick Preview là đưa secret và database production lên mọi bản Preview, và các bản đó chạy được như production (không nhãn). Tạo hai secret mới (chạy hai lần, mỗi lần một giá trị khác):

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Không dùng `npx auth secret` ở đây: lệnh đó ghi vào `.env.local` của máy dev.

| Biến | Giá trị |
|---|---|
| `NEXT_PUBLIC_APP_ENV` | `production` |
| `DATABASE_URL` | Neon `main` → Connect, bật *Connection pooling* (host có `-pooler`) |
| `DIRECT_URL` | Neon `main` → Connect, tắt *Connection pooling* |
| `AUTH_SECRET` | secret mới thứ nhất |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | client `Taskeo` |
| `TOKEN_ENCRYPTION_KEY` | secret mới thứ hai |

- Đánh dấu *Sensitive* cho mọi biến trừ `NEXT_PUBLIC_APP_ENV`.
- Không cần `AUTH_URL` / `AUTH_TRUST_HOST`: Auth.js tự tin host khi chạy trên Vercel.
- `TOKEN_ENCRYPTION_KEY` mất là không giải mã được token đã lưu: cất thêm một bản ở trình quản lý mật khẩu (quy trình đầy đủ ở T74).
- Không dán giá trị thật vào `.env.production.example` (file được commit).

## 5. Áp migration lên Neon `main`

Chạy trên máy, trong **một cửa sổ PowerShell mới** (dấu nhắc `PS C:\...>`), mọi lệnh trong cùng cửa sổ đó, xong thì đóng để chuỗi kết nối không sót lại trong shell:

```powershell
$env:DATABASE_URL = Read-Host "DATABASE_URL (chuỗi có pooling của branch main)"
$env:DIRECT_URL = Read-Host "DIRECT_URL (chuỗi trực tiếp của branch main)"
npm run db:deploy
npx prisma migrate status
```

Mỗi dòng `Read-Host` hỏi một chuỗi: dán vào rồi Enter. Dán qua `Read-Host` thì lịch sử PowerShell (PSReadLine) chỉ lưu câu lệnh, không lưu chuỗi kết nối có mật khẩu; đừng gõ thẳng `$env:DATABASE_URL = "postgresql://..."`.

`migrate status` phải báo *Database schema is up to date*. Lỗi `Environment variable not found: DIRECT_URL` nghĩa là cửa sổ đó chưa có biến (đặt ở cửa sổ khác, hoặc đang dùng `cmd` / Git Bash). `db:deploy` (`prisma migrate deploy`) chỉ áp migration đã có trong repo, không tạo migration mới, không xoá dữ liệu. Chi tiết: [03-database.md](03-database.md#mỗi-môi-trường-một-database).

## 6. Deploy lại và kiểm tra

Đổi **bất kỳ** biến nào cũng phải build lại, không riêng `NEXT_PUBLIC_*`: trang `/login` được dựng sẵn lúc build (header `x-nextjs-prerender: 1`) và giữ nguyên chế độ `misconfigured` / `configured` của lúc build.

**Deployments** → bản Production mới nhất → **⋯ → Redeploy**, bỏ tick *Use existing Build Cache*, chờ **Ready**.

Kiểm tra:

1. Mở `https://taskeo-zeta.vercel.app`: tiêu đề tab là `Taskeo`, không nhãn.
2. `/login` hiện nút "Đăng nhập bằng Google", không phải thông báo chặn truy cập. Nếu bị chặn: thiếu biến ở Environment Production, hoặc chưa build lại.
3. Bấm đăng nhập: trình duyệt sang `accounts.google.com`, tham số `redirect_uri` là `https://taskeo-zeta.vercel.app/api/auth/callback/google`, Google không báo `redirect_uri_mismatch`.

## Về sau

- Migrate tự động khi deploy: T67. Hiện tại mỗi lần có migration mới phải chạy bước 5 khi release `develop` → `main`, trước khi bản production mới được deploy.
- Domain riêng + consent screen In production: T71.
- Merge qua Pull Request: T72. Muốn có bản Preview chạy được cho PR thì phải thêm lại một môi trường (database, OAuth client, secret riêng).
