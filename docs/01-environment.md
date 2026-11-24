# 01 · Môi trường

## Node

Cần **Node 20.9+**. Máy này đang mặc định Node 16 qua nvm-windows, chuyển bằng:

```powershell
nvm use 24.11.1
```

## Cài đặt và chạy

```powershell
npm install
npm run dev
```

Mở http://localhost:3000.

## Ba môi trường

Taskeo có ba môi trường. Mỗi môi trường dùng **database, OAuth client và secret riêng**, không dùng chung.

| | development | staging | production |
|---|---|---|---|
| Chạy ở | Máy local (`npm run dev`) | Vercel **Preview** | Vercel **Production** |
| Nhánh git | bất kỳ | `develop` (và nhánh nhiệm vụ) | `main` |
| `NEXT_PUBLIC_APP_ENV` | `development` | `staging` | `production` |
| Biến đặt ở | `.env.local` (mẫu: `.env.example`) | Vercel → Environment Variables → Preview (mẫu: `.env.staging.example`) | Vercel → Environment Variables → Production (mẫu: `.env.production.example`) |
| Database | `taskeo_dev` (hoặc Neon branch `dev`) | `taskeo_staging` (Neon branch `staging`) | `taskeo` (Neon branch `main`) |
| OAuth redirect URI | `http://localhost:3000/api/auth/callback/google` | `https://<domain-staging>/api/auth/callback/google` | `https://<domain-production>/api/auth/callback/google` |
| Chế độ demo | Được (khi không có biến auth nào) | **Không** — thiếu biến là bị chặn | **Không** — thiếu biến là bị chặn |
| Nhận biết | Tiêu đề `Taskeo · Dev`, nhãn "Dev" ở sidebar | Tiêu đề `Taskeo · Staging`, nhãn "Staging" | Tiêu đề `Taskeo`, không nhãn |

Cách app xác định môi trường (`src/config/app.ts`, hàm `resolveAppEnv`):

1. `NEXT_PUBLIC_APP_ENV` nếu có. Giá trị khác ba giá trị trên → app **dừng với lỗi** (fail fast).
2. Không có thì suy từ `NEXT_PUBLIC_VERCEL_ENV` do Vercel tự cấp: `production` → production, `preview` → staging, `development` → development.
3. Không có nữa thì `NODE_ENV=production` → production, còn lại → development.

Lưu ý:

- `NEXT_PUBLIC_*` được nhúng vào bundle **lúc build**. Đổi môi trường trên Vercel thì phải deploy lại.
- Nên đặt `NEXT_PUBLIC_APP_ENV` tường minh trên Vercel cho từng môi trường thay vì dựa vào bước 2.
- `npm run build && npm start` ở máy local chạy với `NODE_ENV=production`: không đặt `NEXT_PUBLIC_APP_ENV=development` thì app coi là production, và không có biến auth sẽ bị chặn. `.env.example` đã đặt sẵn `development`.
- Thiết lập Vercel (người dùng tự làm): Settings → Git → Production Branch = `main`; thêm biến cho Preview với Branch = `develop` nếu muốn tách staging khỏi preview của nhánh khác.

## Biến môi trường

Sao chép `.env.example` thành `.env.local` rồi điền giá trị. **Không commit `.env.local`.** Hai file mẫu `.env.staging.example`, `.env.production.example` chỉ liệt kê biến; giá trị thật đặt trên Vercel.

| Biến | Dùng cho | Hướng dẫn |
|---|---|---|
| `NEXT_PUBLIC_APP_ENV` | Môi trường: `development` / `staging` / `production` | Mục *Ba môi trường* ở trên |
| `DATABASE_URL` | Postgres (Neon / Supabase) | [03-database.md](03-database.md) |
| `AUTH_SECRET` | Auth.js | `npx auth secret` |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | OAuth Google | [02-google-cloud.md](02-google-cloud.md) |
| `TOKEN_ENCRYPTION_KEY` | Mã hoá token Google trong DB (32 byte, base64) | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |

Danh sách biến và cách đọc chúng nằm ở `src/config/env.ts`.

## Ba chế độ chạy

| Chế độ | Khi nào | Hành vi |
|---|---|---|
| `demo` | Môi trường development và không có biến auth nào | Dữ liệu mẫu, lưu trên trình duyệt (localStorage), không cần đăng nhập |
| `configured` | Đủ cả 5 biến auth | Bật đăng nhập Google |
| `misconfigured` | Có một phần, thiếu một phần; hoặc staging / production mà thiếu biến | **Chặn truy cập** (không lặng lẽ rơi về demo). Trang `/login` liệt kê tên các biến còn thiếu |

Chế độ tính bằng hàm thuần `resolveAuthMode(appEnv, missing)` trong `src/config/env.ts`.

## Lệnh

| Lệnh | Việc |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Build production |
| `npm run typecheck` | Kiểm tra TypeScript |
| `npm run lint` | ESLint (gồm cả luật ranh giới giữa các lớp) |
| `npm test` | Unit test (Vitest) cho `src/**/*.test.ts` |
