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

## Biến môi trường

Sao chép `.env.example` thành `.env.local` rồi điền giá trị. **Không commit `.env.local`.**

| Biến | Dùng cho | Hướng dẫn |
|---|---|---|
| `DATABASE_URL` | Postgres (Neon / Supabase) | [03-database.md](03-database.md) |
| `AUTH_SECRET` | Auth.js | `npx auth secret` |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | OAuth Google | [02-google-cloud.md](02-google-cloud.md) |
| `TOKEN_ENCRYPTION_KEY` | Mã hoá token Google trong DB (32 byte, base64) | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |

Danh sách biến và cách đọc chúng nằm ở `src/config/env.ts`.

## Ba chế độ chạy

| Chế độ | Khi nào | Hành vi |
|---|---|---|
| `demo` | Không có biến nào | Dữ liệu mẫu, lưu trên trình duyệt (localStorage), không cần đăng nhập |
| `configured` | Đủ cả 5 biến | Bật đăng nhập Google |
| `misconfigured` | Có một phần, thiếu một phần | **Chặn truy cập** (không lặng lẽ rơi về demo). Trang `/login` liệt kê tên các biến còn thiếu |

## Lệnh

| Lệnh | Việc |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Build production |
| `npm run typecheck` | Kiểm tra TypeScript |
| `npm run lint` | ESLint (gồm cả luật ranh giới giữa các lớp) |
| `npm test` | Unit test (Vitest) cho `src/**/*.test.ts` |
