# T002 · Database Neon + migration đầu tiên

| | |
|---|---|
| Nhánh | `chore/T002-neon-database` |
| Tạo từ | `develop` @ `b37b633` |
| Trạng thái | 4-review |
| Ngày tạo | 2026-11-24 |

Sheet nhiệm vụ: T07 (một phần B1 trong backlog: migration; phần đăng nhập Google thật để T15).

## 1. Docs – yêu cầu

**Mục tiêu:** app nối được vào Postgres thật trên Neon và có migration đầu tiên trong repo.

**Phạm vi:**
- Người dùng đã tạo Neon project `taskeo` (region `aws-ap-southeast-1`), branch `main` / `staging` / `dev`, dán chuỗi kết nối của branch `dev` vào `.env.local` (`DATABASE_URL` qua pooler, `DIRECT_URL` trực tiếp).
- `prisma/schema.prisma`: thêm `directUrl = env("DIRECT_URL")` để Prisma CLI (migrate, studio) không đi qua pooler.
- `package.json`: script `db:migrate`, `db:deploy`, `db:studio`, `db:status` đọc `.env.local` bằng `node --env-file` (Prisma CLI chỉ tự đọc `.env`).
- Chạy migration `init` trên branch `dev`, commit `prisma/migrations/`.
- Cập nhật `.env.example`, `.env.staging.example`, `.env.production.example`, docs 01 và 03.

**Ngoài phạm vi:**
- Đăng nhập Google thật ở chế độ `configured` (T15).
- Đặt biến trên Vercel, migrate staging / production (T08, T63, T67).

**Tiêu chí nghiệm thu** (mỗi dòng kiểm tra được):
- [ ] `schema.prisma` có `directUrl`; `npx prisma validate` qua.
- [ ] `prisma/migrations/<timestamp>_init/migration.sql` có trong repo và tạo đủ bảng của schema.
- [ ] `npm run db:status` báo database `dev` khớp migration ("Database schema is up to date").
- [ ] Truy vấn thử qua `DATABASE_URL` (pooler) bằng Prisma Client chạy được.
- [ ] Ba file `.env*.example` có `DIRECT_URL`; docs 01 và 03 nói rõ hai chuỗi và các script `db:*`.
- [ ] typecheck, lint, test, build xanh.

**Tài liệu bị ảnh hưởng:** 01 môi trường · 03 DB

## 2. Kế hoạch từng phần

| Phần | Việc | File | Agent | Test cần viết |
|---|---|---|---|---|
| P1 | `directUrl` + script `db:*` + file env mẫu + docs | `prisma/schema.prisma`, `package.json`, `.env*.example`, `docs/01`, `docs/03` | tự làm (thay đổi cấu hình nhỏ) | không (cấu hình); kiểm bằng `prisma validate` |
| P2 | Chạy `npm run db:migrate -- --name init`, kiểm tra `db:status` và một truy vấn thử | `prisma/migrations/` | tự làm (cần `.env.local` của người dùng) | không; kiểm bằng `db:status` + truy vấn thử |

Rủi ro / phụ thuộc:
- `DIRECT_URL` không thuộc `AUTH_ENV_VARS` trong `src/config/env.ts`: app chạy không cần nó, chỉ CLI cần. Thiếu nó thì Prisma CLI báo lỗi rõ ràng.
- Migration chạy nhầm branch Neon: chỉ chạy với `.env.local` (branch `dev`).

Duyệt kế hoạch: ☐ chờ · ☑ người dùng đã duyệt (2026-11-24, trong chat: làm theo các bước đề xuất rồi báo "done") · ☐ bỏ qua (`--yes`)

Kế hoạch tự viết, không qua `planner`: hai phần cấu hình nhỏ, đã thống nhất với người dùng trước.

## 3. Thực hiện + kiểm thử

| Phần | Commit | Test thêm | typecheck | lint | test | build |
|---|---|---|---|---|---|---|
| P1 | `d596dd5` | không; `prisma validate` qua | ✅ | ✅ | ✅ 61/61 | ✅ |
| P2 | (commit này) | không; `db:status` "Database schema is up to date", truy vấn thử qua pooler: 10 bảng (9 model + `_prisma_migrations`), 0 user | ✅ | ✅ | ✅ | ✅ |

Ghi chú P2: `migrate dev` áp migration `20261124072351_init` thành công nhưng bước `prisma generate` chạy kèm báo `EPERM` vì `npm run dev` của người dùng đang giữ file query engine. Client đã sinh trước đó vẫn đúng (không đổi model); chạy `npx prisma generate` sau khi tắt dev server.

## 4. Review code

Reviewer đã chạy:

| # | Mức | File:dòng | Vấn đề | Reviewer |
|---|---|---|---|---|
| R1 | | | | |

## 5. Fix bug

| Phát hiện | Xử lý | Commit |
|---|---|---|
| R1 | | |

Kết quả 4 lệnh sau khi sửa:

## 6. Review lại

Vòng 1:

## 7. Final

**Tóm tắt:**

**Tiêu chí nghiệm thu:** (đánh dấu ở mục 1)

**Tài liệu đã cập nhật:**

**Merge vào develop:** commit `<hash>`, ngày

**Việc để sau:**
-
