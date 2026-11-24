# 03 · Database

1. Tạo Postgres trên Neon hoặc Supabase, điền chuỗi kết nối vào `DATABASE_URL`.
2. Tạo bảng:

```powershell
npx prisma migrate dev --name init
```

## Mỗi môi trường một database

development, staging và production **không dùng chung database**. Với Neon: một project `taskeo`, ba branch `main` (production), `staging`, `dev`; mỗi branch một chuỗi kết nối đặt vào `DATABASE_URL` của môi trường đó ([01-environment.md](01-environment.md#ba-môi-trường)).

| Môi trường | Tạo / áp migration |
|---|---|
| development | `npx prisma migrate dev` (tạo migration mới) |
| staging | `npx prisma migrate deploy` với `DATABASE_URL` của staging, trước khi merge vào `develop` được deploy |
| production | `npx prisma migrate deploy` với `DATABASE_URL` của production, khi release `develop` → `main` |

Không chạy `migrate dev` hay `migrate reset` trên staging / production.

`npm install` tự chạy `prisma generate` (script `postinstall`).

## Schema

File: `prisma/schema.prisma`. Prisma client dùng chung ở `src/server/db.ts` (giữ một instance duy nhất khi hot reload).

Mô hình dữ liệu: **Không gian → Dự án → Công việc**. Enum trong `src/domain/types.ts` trùng với enum Prisma.

## Khác với bản kế hoạch

- Bỏ trạng thái "Quá hạn": quá hạn = `dueDate` < hôm nay và chưa xong.
- Thêm bảng `TaskFile` (gắn file Drive vào công việc) và `Activity.meta` (nhật ký từng thay đổi).
- `Task.space` dùng `onDelete: Cascade`; `Task.project` dùng `SetNull` (công việc rơi về không gian).
