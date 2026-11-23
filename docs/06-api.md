# 06 · API

## Hiện có

| Route | File | Việc |
|---|---|---|
| `/api/auth/*` | `src/app/api/auth/[...nextauth]/route.ts` | Auth.js (đăng nhập Google, callback, session) |
| Server action `signInWithGoogle`, `signOutAction` | `src/server/auth/actions.ts` | Đăng nhập / đăng xuất từ giao diện |

`src/proxy.ts` chỉ kiểm tra lạc quan (có cookie phiên hay không). Kiểm tra thật nằm ở `getViewer()` và ở từng API route (`auth()`).

## Giai đoạn 2 (chưa làm)

- API route `tasks` / `spaces` / `projects` dùng Prisma + Zod (`src/domain/validation.ts`); kiểm tra `task.spaceId` khớp `project.spaceId`.
- Logic truy vấn đặt ở `src/server/`, route trong `src/app/api/` chỉ parse input, gọi hàm server và trả kết quả.
- Thay `src/store/workspace-store.ts` bằng TanStack Query gọi API. Giao diện chỉ phụ thuộc `useWorkspace()` / `updateWorkspace()`, nên các file trong `features/` không phải sửa.
- Khi trang render từ dữ liệu server, đổi `experimental.instantInsights.validationLevel` trong `next.config.ts` về `"warning"`.
