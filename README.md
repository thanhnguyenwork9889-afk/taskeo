# Workspace

Web app cá nhân bọc Google Workspace: gom công việc, tài liệu và lịch về một màn Tổng quan, chia theo không gian (Không gian → Dự án → Công việc). Giao diện port từ prototype Figma Make (`../Workspace App Shell Design`).

## Chạy thử

Cần **Node 20.9+** (máy này đang mặc định Node 16 qua nvm-windows; chuyển bằng `nvm use 24.11.1`).

```powershell
npm install
npm run dev
```

Mở http://localhost:3000. Chưa có `.env.local` thì app chạy **chế độ demo**: dữ liệu mẫu, lưu trên trình duyệt (localStorage), không cần đăng nhập.

## Bật đăng nhập Google

1. Làm Giai đoạn 0 trong kế hoạch: tạo project Google Cloud, OAuth consent screen (External, Testing), OAuth Client ID (Web) với redirect URI `http://localhost:3000/api/auth/callback/google`.
2. Tạo Postgres (Neon / Supabase).
3. Sao chép `.env.example` thành `.env.local` và điền đủ 5 biến.
4. `npx prisma migrate dev --name init`

Không có biến nào → chế độ demo. Có một phần nhưng thiếu biến → app **chặn truy cập** (không lặng lẽ rơi về demo) và trang `/login` liệt kê tên các biến còn thiếu.

## Lệnh

| Lệnh | Việc |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Build production |
| `npm run typecheck` | Kiểm tra TypeScript |
| `npm run lint` | ESLint |
| `npm test` | Unit test (Vitest) cho `lib/` |

## Cấu trúc

```
app/
  (auth)/login/          trang đăng nhập
  (app)/                 layout có sidebar; Tổng quan, tasks, docs, calendar, spaces, projects
  api/auth/[...nextauth] Auth.js
  actions/auth.ts        server action đăng nhập / đăng xuất
components/
  shell/                 sidebar, topbar, mobile nav, hộp thoại tạo mới, UI context
  dashboard/ tasks/ spaces/ projects/ docs/ calendar/ ui/
lib/
  types.ts labels.ts     kiểu dữ liệu + nhãn tiếng Việt (enum trùng Prisma)
  workspace-actions.ts   thao tác dữ liệu dạng hàm thuần (có test)
  workspace-store.ts     store client cho chế độ demo (localStorage)
  validation.ts          schema Zod dùng chung
  auth.ts session.ts     Auth.js + người dùng hiện tại
  crypto.ts              mã hoá token Google (AES-256-GCM)
  google/                OAuth client theo user, scope theo giai đoạn
prisma/schema.prisma
proxy.ts                 chuyển về /login khi chưa có cookie phiên (chỉ khi bật auth)
```

## So với bản kế hoạch

- Bỏ trạng thái "Quá hạn": quá hạn = `dueDate` < hôm nay và chưa xong.
- Thêm bảng `TaskFile` (gắn file Drive vào công việc) và `Activity.meta` (nhật ký từng thay đổi).
- `Task.space` dùng `onDelete: Cascade`; `Task.project` dùng `SetNull` (công việc rơi về không gian).
- Token Google được mã hoá trước khi ghi DB (bọc `linkAccount` của Prisma adapter).
- Google Picker (giai đoạn 3) chạy trên trình duyệt nên cần một route trả access token ngắn hạn chỉ có scope `drive.file` — ngoại lệ có chủ đích với nguyên tắc "client không cầm token".

## Việc tiếp theo (Giai đoạn 2)

- API route `tasks/spaces/projects` dùng Prisma + Zod, kiểm tra `task.spaceId` khớp `project.spaceId`.
- Thay `workspace-store.ts` bằng TanStack Query gọi API; giao diện chỉ phụ thuộc `useWorkspace()` / `updateWorkspace()`.
- Khi trang render từ dữ liệu server, đổi `experimental.instantInsights.validationLevel` trong `next.config.ts` về `"warning"`.
