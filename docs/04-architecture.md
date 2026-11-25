# 04 · Kiến trúc và cấu trúc thư mục

Code ứng dụng nằm trong `src/`, file cấu hình nằm ở gốc. Thư mục trong `src/` xếp theo **lớp**, từ thấp lên cao:

```
src/
├── config/            1. Tên app, môi trường, biến môi trường, chế độ chạy
│   ├── app.ts            APP_NAME ("Taskeo"), môi trường development / production
│   └── env.ts            Chế độ chạy demo / configured / misconfigured (demo chỉ ở development)
├── server/            2. Chỉ chạy trên server ("server-only")
│   ├── db.ts             Prisma client
│   ├── crypto.ts         Mã hoá token Google (AES-256-GCM)
│   ├── http.ts           Phản hồi API dạng { data, error }, đọc JSON, lỗi 400/401/503/500
│   ├── spaces.ts         Truy vấn không gian, luôn lọc theo userId
│   ├── auth/
│   │   ├── auth.ts       Cấu hình Auth.js
│   │   ├── session.ts    getViewer(): người dùng hiện tại · getApiUserId(): userId cho API route
│   │   ├── session-callback.ts  Dựng phiên trả cho client (chỉ id, name, email, image)
│   │   └── actions.ts    Server action đăng nhập / đăng xuất
│   └── google/
│       ├── client.ts     OAuth client theo user
│       └── scopes.ts     Scope theo giai đoạn
├── domain/            3. Logic nghiệp vụ thuần, có test, chạy được cả client lẫn server
│   ├── types.ts labels.ts       Kiểu dữ liệu + nhãn tiếng Việt
│   ├── validation.ts            Schema Zod dùng chung (storage + input API)
│   ├── space-record.ts          Bản ghi DB → Space phía client
│   ├── workspace-actions.ts     Thao tác dữ liệu dạng hàm thuần
│   ├── task-filters.ts stats.ts dates.ts
│   ├── seed.ts                  Dữ liệu mẫu cho chế độ demo
│   └── *.test.ts
├── store/             4. State phía client
│   └── workspace-store.ts       Store chế độ demo (localStorage)
├── components/        5. UI dùng chung
│   ├── ui/                      Badge, modal, checkbox, SpaceIcon, SpaceStylePicker... + styles.ts
│   └── layout/                  App shell: sidebar, topbar, mobile nav, hộp thoại tạo mới, UI context
├── features/          6. Màn hình theo nghiệp vụ
│   ├── dashboard/  tasks/  spaces/  projects/  docs/  calendar/
├── app/               7. Chỉ routing (Next.js App Router), mỏng nhất có thể
│   ├── (auth)/login/            Trang đăng nhập
│   ├── (app)/                   Layout có sidebar + các trang
│   ├── api/auth/[...nextauth]/  Auth.js
│   └── api/spaces/              CRUD không gian (route chỉ parse input, gọi server/spaces)
└── proxy.ts           Chuyển về /login khi chưa có cookie phiên (chỉ khi bật auth)
```

## Quy tắc import

Lớp trên được import lớp dưới, **không có chiều ngược lại**. ESLint kiểm tra các luật này (`eslint.config.mjs`), `npm run lint` sẽ báo lỗi nếu vi phạm.

| Thư mục | Không được import |
|---|---|
| `config/` | Bất cứ gì trong `@/` |
| `domain/` | `app`, `server`, `store`, `features`, `components`, `react`, `next/*` |
| `store/`, `features/`, `components/` | `server/*` (trừ `server/auth/actions`), `app/*` |
| `components/ui/` | `features`, `components/layout`, `store` |

## Đặt file mới ở đâu

| Bạn viết… | Đặt vào |
|---|---|
| Trang / route mới | `src/app/…/page.tsx`, chỉ import một view từ `features/` |
| Màn hình, card, bảng cho một nghiệp vụ | `src/features/<nghiệp-vụ>/` |
| Component dùng ở nhiều feature, không biết gì về nghiệp vụ | `src/components/ui/` |
| Hàm tính toán, lọc, validate | `src/domain/` (kèm `*.test.ts`) |
| Code đụng DB, token, API Google | `src/server/` (đầu file có `import "server-only"`) |
| API route mới | `src/app/api/<resource>/route.ts`: `getApiUserId()` → validate bằng Zod → `import()` động hàm trong `src/server/<resource>.ts` (để chế độ demo không khởi tạo Prisma); GET gọi `await connection()` ở dòng đầu |
| Biến môi trường mới | `src/config/env.ts` + cả ba file `.env*.example` + [01-environment.md](01-environment.md) |
| Hiện tên app | `APP_NAME` từ `@/config/app`, không viết cứng "Taskeo" |
