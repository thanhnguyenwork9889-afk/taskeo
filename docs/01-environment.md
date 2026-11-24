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
| Database | Neon branch `dev` | Neon branch `staging` | Neon branch `main` |
| OAuth redirect URI | `http://localhost:3000/api/auth/callback/google` | `https://<domain-staging>/api/auth/callback/google` | `https://<domain-production>/api/auth/callback/google` |
| Chế độ demo | Được (chỉ `npm run dev`, khi không có biến auth nào) | **Không** — thiếu biến là bị chặn | **Không** — thiếu biến là bị chặn |
| Nhận biết | Tiêu đề `Taskeo · Dev`, nhãn "Dev" ở sidebar | Tiêu đề `Taskeo · Staging`, nhãn "Staging" | Tiêu đề `Taskeo`, không nhãn |

Cách app xác định môi trường (`src/config/app.ts`, hàm `resolveAppEnv`):

1. `NEXT_PUBLIC_APP_ENV` nếu có. Giá trị khác ba giá trị trên → app **dừng với lỗi** (fail fast). Chuỗi rỗng coi như không đặt.
2. Không có thì suy từ `NEXT_PUBLIC_VERCEL_ENV` do Vercel tự cấp: `production` → production, `preview` → staging, `development` → development.
3. Không có nữa thì `NODE_ENV=production` → production, còn lại → development.

Lưu ý:

- `NEXT_PUBLIC_*` được nhúng vào bundle **lúc build**. Đổi môi trường trên Vercel thì phải deploy lại.
- **Đặt `NEXT_PUBLIC_APP_ENV` tường minh trên Vercel** cho từng scope (Preview = `staging`, Production = `production`). Bước 2 chỉ chạy khi Vercel bật *Automatically expose System Environment Variables*; nếu không, Preview bị suy thành production (vẫn chặn truy cập, nhưng sai nhãn).
- `npm run build && npm start` chạy với `NODE_ENV=production`. Bản build production **không bao giờ** vào chế độ demo, kể cả khi `NEXT_PUBLIC_APP_ENV=development` (chống đặt nhầm biến trên bản deploy): thiếu biến auth là bị chặn. Muốn xem demo thì dùng `npm run dev`.
- Thiết lập Vercel (người dùng tự làm): Settings → Git → Production Branch = `main`; thêm biến cho Preview với Branch = `develop` nếu muốn tách staging khỏi preview của nhánh khác.

## Biến môi trường

Sao chép `.env.example` thành `.env.local` rồi điền giá trị. **Không commit `.env.local`.** Hai file mẫu `.env.staging.example`, `.env.production.example` chỉ liệt kê biến; giá trị thật đặt trên Vercel.

| Biến | Dùng cho | Hướng dẫn |
|---|---|---|
| `NEXT_PUBLIC_APP_ENV` | Môi trường: `development` / `staging` / `production` | Mục *Ba môi trường* ở trên |
| `DATABASE_URL` | Postgres trên Neon, chuỗi có pooling (app dùng khi chạy) | [03-database.md](03-database.md) |
| `DIRECT_URL` | Postgres trên Neon, chuỗi trực tiếp (chỉ Prisma CLI: migrate, studio). Không tính vào 5 biến auth | [03-database.md](03-database.md) |
| `AUTH_SECRET` | Auth.js | `npx auth secret` |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | OAuth Google | [02-google-cloud.md](02-google-cloud.md) |
| `TOKEN_ENCRYPTION_KEY` | Mã hoá token Google trong DB (32 byte, base64) | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |

Danh sách biến và cách đọc chúng nằm ở `src/config/env.ts`.

## Ba chế độ chạy

| Chế độ | Khi nào | Hành vi |
|---|---|---|
| `demo` | Môi trường development, chạy `npm run dev` (không phải bản build production) và không có biến auth nào | Dữ liệu mẫu, lưu trên trình duyệt (localStorage), không cần đăng nhập |
| `configured` | Đủ cả 5 biến auth | Bật đăng nhập Google |
| `misconfigured` | Có một phần, thiếu một phần; hoặc staging / production mà thiếu biến | **Chặn truy cập** (không lặng lẽ rơi về demo). Ở development, trang `/login` liệt kê tên các biến còn thiếu; ở staging / production chỉ hiện thông báo chung |

Chế độ tính bằng hàm thuần `resolveAuthMode` trong `src/config/env.ts`.

## Lệnh

| Lệnh | Việc |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Build production |
| `npm run typecheck` | Kiểm tra TypeScript |
| `npm run lint` | ESLint (gồm cả luật ranh giới giữa các lớp) |
| `npm test` | Unit test (Vitest) cho `src/**/*.test.ts` |
