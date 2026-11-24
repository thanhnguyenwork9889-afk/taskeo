# 03 · Database

Postgres trên [Neon](https://neon.tech): một project `taskeo` (region `aws-ap-southeast-1`, Singapore), ba branch `main` (production), `staging`, `dev`. Development, staging và production **không dùng chung database**; mỗi branch có chuỗi kết nối riêng đặt vào biến của môi trường đó ([01-environment.md](01-environment.md#ba-môi-trường)).

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

Prisma CLI chỉ tự đọc file `.env`, không đọc `.env.local`, nên các script dưới đây chạy CLI qua `node --env-file=.env.local`.

| Script | Lệnh Prisma | Khi nào |
|---|---|---|
| `npm run db:migrate -- --name <tên>` | `migrate dev` | Sửa `schema.prisma` xong, tạo migration mới trên branch `dev` |
| `npm run db:status` | `migrate status` | Xem database có khớp migration trong repo không |
| `npm run db:studio` | `studio` | Xem / sửa dữ liệu trên trình duyệt |
| `npm run db:deploy` | `migrate deploy` | Áp migration có sẵn, không tạo mới |

`npm install` tự chạy `prisma generate` (script `postinstall`).

## Mỗi môi trường một database

| Môi trường | Neon branch | Tạo / áp migration |
|---|---|---|
| development | `dev` | `npm run db:migrate` (tạo migration mới) |
| staging | `staging` | `npx prisma migrate deploy` với `DATABASE_URL` / `DIRECT_URL` của staging, trước khi merge vào `develop` được deploy |
| production | `main` | `npx prisma migrate deploy` với `DATABASE_URL` / `DIRECT_URL` của production, khi release `develop` → `main` |

Không chạy `migrate dev` hay `migrate reset` trên staging / production.

## Schema

File: `prisma/schema.prisma`. Migration: `prisma/migrations/` (commit vào repo). Prisma client dùng chung ở `src/server/db.ts` (giữ một instance duy nhất khi hot reload).

Mô hình dữ liệu: **Không gian → Dự án → Công việc**. Enum trong `src/domain/types.ts` trùng với enum Prisma.

## Khác với bản kế hoạch

- Bỏ trạng thái "Quá hạn": quá hạn = `dueDate` < hôm nay và chưa xong.
- Thêm bảng `TaskFile` (gắn file Drive vào công việc) và `Activity.meta` (nhật ký từng thay đổi).
- `Task.space` dùng `onDelete: Cascade`; `Task.project` dùng `SetNull` (công việc rơi về không gian).
