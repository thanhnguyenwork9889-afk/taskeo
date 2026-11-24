# 03 · Database

Postgres trên [Neon](https://neon.tech): một project `taskeo` (region `aws-ap-southeast-1`, Singapore), hai branch `main` (production) và `dev` (development). Hai môi trường **không dùng chung database**; mỗi branch có chuỗi kết nối riêng đặt vào biến của môi trường đó ([01-environment.md](01-environment.md#hai-môi-trường)).

## Thiết lập lần đầu (development)

1. Neon → project `taskeo` → branch `dev` → **Connect**. Lấy hai chuỗi:
   - `DATABASE_URL`: bật *Connection pooling* (host có `-pooler`). App dùng chuỗi này khi chạy.
   - `DIRECT_URL`: tắt *Connection pooling*. Prisma CLI dùng chuỗi này để migrate (migrate qua pooler dễ lỗi).
2. Dán cả hai vào `.env.local` (mẫu: `.env.example`).
3. Tạo bảng:

```powershell
npm run db:migrate
```

## Script

Prisma CLI chỉ tự đọc file `.env`, không đọc `.env.local`, nên ba script `db:migrate` / `db:status` / `db:studio` chạy CLI qua `node --env-file=.env.local`. Chúng **chỉ dành cho branch `dev`**:

- Cần có `.env.local`; thiếu file thì Node báo lỗi và dừng.
- Biến đã có sẵn trong shell **thắng** giá trị trong `.env.local`. Trước khi chạy, đảm bảo shell không còn `DATABASE_URL` / `DIRECT_URL` của production (`Get-ChildItem Env:*_URL` để kiểm tra).

| Script | Lệnh Prisma | Khi nào |
|---|---|---|
| `npm run db:migrate -- --name <tên>` | `migrate dev` | Sửa `schema.prisma` xong, tạo migration mới trên branch `dev` |
| `npm run db:status` | `migrate status` | Xem database có khớp migration trong repo không |
| `npm run db:studio` | `studio` | Xem / sửa dữ liệu trên trình duyệt |

`npm run db:deploy` (`prisma migrate deploy`) thì ngược lại: **không** đọc `.env.local`, chỉ lấy `DATABASE_URL` / `DIRECT_URL` từ biến của shell. Nó dành cho production (bảng dưới); thiếu biến thì Prisma báo lỗi và dừng.

`npm install` tự chạy `prisma generate` (script `postinstall`).

## Mỗi môi trường một database

| Môi trường | Neon branch | Tạo / áp migration |
|---|---|---|
| development | `dev` | `npm run db:migrate` (tạo migration mới) |
| production | `main` | `npm run db:deploy` với `DATABASE_URL` / `DIRECT_URL` của production, khi release `develop` → `main`, trước khi bản production mới được deploy |

`npm run db:deploy` không đọc `.env.local`: nó lấy `DATABASE_URL` / `DIRECT_URL` từ biến môi trường của shell (hoặc của CI / Vercel khi build — tự động hoá ở T67). Chạy tay thì đặt hai biến của đúng branch trong shell bằng `Read-Host` (để chuỗi không vào lịch sử PowerShell), chạy xong đóng shell. Từng bước: [08-deploy.md](08-deploy.md#5-áp-migration-lên-neon-main).

Không chạy `migrate dev` hay `migrate reset` trên production.

## Schema

File: `prisma/schema.prisma`. Migration: `prisma/migrations/` (commit vào repo). Prisma client dùng chung ở `src/server/db.ts` (giữ một instance duy nhất khi hot reload).

Mô hình dữ liệu: **Không gian → Dự án → Công việc**. Enum trong `src/domain/types.ts` trùng với enum Prisma.

## Khác với bản kế hoạch

- Bỏ trạng thái "Quá hạn": quá hạn = `dueDate` < hôm nay và chưa xong.
- Thêm bảng `TaskFile` (gắn file Drive vào công việc) và `Activity.meta` (nhật ký từng thay đổi).
- `Task.space` dùng `onDelete: Cascade`; `Task.project` dùng `SetNull` (công việc rơi về không gian).
