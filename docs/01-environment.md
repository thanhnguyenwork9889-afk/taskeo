# 01 · Môi trường

## Node

Cần **Node 20.9+** (Next.js); `package.json` khai báo `engines.node` = `24.x` để Vercel build bằng Node 24, khớp máy dev. Máy này đang mặc định Node 16 qua nvm-windows, chuyển bằng:

```powershell
nvm use 24.11.1
```

## Cài đặt và chạy

```powershell
npm install
npm run dev
```

Mở http://localhost:3000.

## Hai môi trường

Taskeo có hai môi trường. Mỗi môi trường dùng **database, OAuth client và secret riêng**, không dùng chung. Không có staging (bỏ ở T003).

| | development | production |
|---|---|---|
| Chạy ở | Máy local (`npm run dev`) | Vercel **Production** |
| Nhánh git | bất kỳ | `main` |
| `NEXT_PUBLIC_APP_ENV` | `development` | `production` |
| Biến đặt ở | `.env.local` (mẫu: `.env.example`) | Vercel → Environment Variables → Production (mẫu: `.env.production.example`) |
| Database | Neon branch `dev` | Neon branch `main` |
| OAuth redirect URI | `http://localhost:3000/api/auth/callback/google` | `https://taskeo-zeta.vercel.app/api/auth/callback/google` |
| Chế độ demo | Được (chỉ `npm run dev`, khi không có biến auth nào) | **Không** — thiếu biến là bị chặn |
| Nhận biết | Tiêu đề `Taskeo · Dev`, nhãn "Dev" ở sidebar | Tiêu đề `Taskeo`, không nhãn |

Bản **Preview** của Vercel (nhánh khác `main`) được coi là production và không có biến nên luôn bị chặn truy cập.

Cách app xác định môi trường (`src/config/app.ts`, hàm `resolveAppEnv`):

1. `NEXT_PUBLIC_APP_ENV` nếu có. Giá trị khác `development` / `production` (kể cả `staging`) → app **dừng với lỗi** (fail fast). Chuỗi rỗng coi như không đặt.
2. Không có thì suy từ `NEXT_PUBLIC_VERCEL_ENV` do Vercel tự cấp: `production` và `preview` → production, `development` → development.
3. Không có nữa thì `NODE_ENV=production` → production, còn lại → development.

Lưu ý:

- `NEXT_PUBLIC_*` được nhúng vào bundle **lúc build**. Đổi môi trường trên Vercel thì phải deploy lại; thực tế đổi bất kỳ biến nào cũng phải deploy lại vì `/login` được dựng sẵn lúc build ([08-deploy.md](08-deploy.md#6-deploy-lại-và-kiểm-tra)).
- Đặt `NEXT_PUBLIC_APP_ENV=production` tường minh trên Vercel (Environment = Production).
- `npm run build && npm start` chạy với `NODE_ENV=production`. Bản build production **không bao giờ** vào chế độ demo, kể cả khi `NEXT_PUBLIC_APP_ENV=development` (chống đặt nhầm biến trên bản deploy): thiếu biến auth là bị chặn. Muốn xem demo thì dùng `npm run dev`.
- Thiết lập Vercel (người dùng tự làm) theo checklist [08-deploy.md](08-deploy.md).

## Biến môi trường

Sao chép `.env.example` thành `.env.local` rồi điền giá trị. **Không commit `.env.local`.** File mẫu `.env.production.example` chỉ liệt kê biến; giá trị thật đặt trên Vercel, không ghi vào file này.

| Biến | Dùng cho | Hướng dẫn |
|---|---|---|
| `NEXT_PUBLIC_APP_ENV` | Môi trường: `development` / `production` | Mục *Hai môi trường* ở trên |
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
| `misconfigured` | Có một phần, thiếu một phần; hoặc production mà thiếu biến | **Chặn truy cập** (không lặng lẽ rơi về demo). Ở development, trang `/login` liệt kê tên các biến còn thiếu; ở production chỉ hiện thông báo chung |

Chế độ tính bằng hàm thuần `resolveAuthMode` trong `src/config/env.ts`.

## Lệnh

| Lệnh | Việc |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Build production |
| `npm run typecheck` | Kiểm tra TypeScript |
| `npm run lint` | ESLint (gồm cả luật ranh giới giữa các lớp) |
| `npm test` | Unit test (Vitest) cho `src/**/*.test.ts` |
| `npm run db:*` | Prisma: migrate / status / studio (branch `dev`), deploy (production) — xem [03-database.md](03-database.md#script) |
