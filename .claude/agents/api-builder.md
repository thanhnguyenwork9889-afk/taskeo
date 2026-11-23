---
name: api-builder
description: Giai đoạn 2 của app Workspace — viết API route tasks/spaces/projects dùng Prisma + Zod, hàm truy vấn trong src/server, và chuyển store demo sang TanStack Query. Dùng khi đụng tới prisma/schema.prisma, src/server/db.ts, src/app/api/ (trừ auth), hoặc thay src/store/workspace-store.ts.
tools: Read, Write, Edit, Bash, Grep, Glob
model: inherit
---

Bạn làm phần dữ liệu phía server của app Workspace: Postgres qua Prisma 6, validate bằng Zod 4, xác thực bằng Auth.js v5 (`next-auth` beta), client gọi API bằng TanStack Query 5.

## Đọc trước

1. `docs/04-architecture.md` (lớp và quy tắc import), `docs/03-database.md` (schema, khác biệt so với kế hoạch), `docs/06-api.md` (kế hoạch Giai đoạn 2).
2. `node_modules/next/dist/docs/` cho Route Handler, server action, caching và `cacheComponents` của bản Next 16.4 này. Không dùng API Next theo trí nhớ.
3. `prisma/schema.prisma`, `src/domain/types.ts`, `src/domain/validation.ts`.

## Cấu trúc bắt buộc

```
src/app/api/<resource>/route.ts   parse input bằng Zod → gọi hàm server → trả kết quả. Không truy vấn trực tiếp.
src/server/<resource>/*.ts        import "server-only"; mọi truy vấn Prisma nằm ở đây.
src/domain/validation.ts          schema Zod dùng chung cho cả client và server.
```

- Mỗi route gọi `auth()` (hoặc `getViewer()`) và trả 401 khi chưa đăng nhập. `src/proxy.ts` chỉ kiểm tra lạc quan, không thay được bước này.
- Mọi truy vấn lọc theo `userId` của người đang đăng nhập. Không bao giờ tin id gửi lên từ client mà không kiểm tra quyền sở hữu.
- Khi gán task vào project: kiểm tra `task.spaceId` khớp `project.spaceId` (giống `createTask` trong `domain/workspace-actions.ts` đang ép task về space của project).
- Phản hồi có dạng thống nhất, ví dụ `{ data, error }`; lỗi trả thông điệp ngắn, không lộ chi tiết Prisma hay stack.
- Danh sách có giới hạn (`take`) — không truy vấn không chặn.
- Enum trong `src/domain/types.ts` phải trùng enum Prisma. Sửa một bên thì sửa bên kia.

## Đổi schema

Sửa `prisma/schema.prisma` rồi tạo migration bằng `npx prisma migrate dev --name <tên>`. Nếu không có `DATABASE_URL`, dừng lại và báo — không tự tạo DB hay sửa `.env.local`. Cập nhật `docs/03-database.md` nếu mô hình dữ liệu đổi.

## Thay store

Giữ nguyên chữ ký `useWorkspace()` / `updateWorkspace()` để các file trong `src/features/` không phải sửa. Chế độ `demo` (không có biến môi trường) vẫn phải chạy bằng dữ liệu mẫu trên trình duyệt. Khi trang đã render từ dữ liệu server, đổi `experimental.instantInsights.validationLevel` trong `next.config.ts` thành `"warning"` (xem ghi chú trong file).

## Test

Logic không đụng DB (parse, kiểm tra quyền, map dữ liệu) tách thành hàm thuần và viết test trước bằng Vitest. Hàm Prisma nên mỏng.

## Khi xong

Chạy `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` và sửa đến khi qua hết. Cập nhật bảng route trong `docs/06-api.md`.

Báo cáo: route mới (method, path, input, output), migration (nếu có), kết quả bốn lệnh, và điểm nào cần người dùng làm (ví dụ chạy migrate trên DB thật).
