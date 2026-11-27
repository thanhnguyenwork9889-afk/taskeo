# 04 · Kiến trúc và cấu trúc thư mục

Code ứng dụng nằm trong `src/`, file cấu hình nằm ở gốc. Thư mục trong `src/` xếp theo **lớp**, từ thấp lên cao:

```
src/
├── config/            1. Tên app, môi trường, biến môi trường, chế độ chạy
│   ├── app.ts            APP_NAME ("Taskeo"), môi trường development / production
│   ├── auth-cookies.ts   Tên cookie phiên Auth.js (một nguồn cho proxy.ts và server/auth), khoá với mặc định Auth.js bằng test
│   └── env.ts            Chế độ chạy demo / configured / misconfigured (demo chỉ ở development)
├── server/            2. Chỉ chạy trên server ("server-only")
│   ├── db.ts             Prisma client
│   ├── crypto.ts         Mã hoá token Google (AES-256-GCM)
│   ├── http.ts           Phản hồi API dạng { data, error }, đọc JSON, lỗi 400/401/503/500, isValidRouteId (1–64 ký tự, không NUL), duplicateQueryKeyMessage
│   ├── spaces.ts         Truy vấn không gian, luôn lọc theo userId
│   ├── projects.ts       Truy vấn dự án: lọc userId, kiểm không gian thuộc user, trùng tên không phân biệt hoa thường; tạo dự án + activity project_created trong một transaction
│   ├── tasks.ts          Truy vấn công việc: lọc userId, kiểm dự án / không gian trong body thuộc user, spaceId theo dự án, completedAt; ghi activity task_created / task_done trong cùng transaction
│   ├── activities.ts     Đọc nhật ký hoạt động của user, mới nhất trước
│   ├── drive-files.ts    listFiles: file Drive trong thư mục không gian / dự án của user (lọc userId, chia khối parents, lọc trong bộ nhớ cho Tài liệu gần đây)
│   ├── auth/
│   │   ├── auth.ts       Cấu hình Auth.js
│   │   ├── google-tokens.ts  Tham số đăng nhập Google (offline, consent) + tham số xin thêm scope · mã hoá token trước linkAccount · dữ liệu cập nhật token khi đăng nhập lại (hàm thuần, có test)
│   │   ├── session.ts    getViewer(): người dùng hiện tại + driveConnected (configured: chờ connection() trước auth(), không chạy lúc prerender) · getApiUserId(): userId cho API route
│   │   ├── redirect-path.ts  toSafeRedirectPath: chỉ nhận đường dẫn nội bộ làm đích chuyển hướng · withQueryParam
│   │   ├── account-link.ts  shouldBlockAccountLink: hàm thuần, một user chỉ một tài khoản Google
│   │   ├── account-link-data.ts  guardSignIn (callback signIn): đọc phiên từ cookie + bảng Session, một truy vấn Account, chặn → /?drive=wrong-account
│   │   ├── session-callback.ts  Dựng phiên trả cho client (chỉ id, name, email, image)
│   │   └── actions.ts    Server action đăng nhập (tuỳ chọn kèm Drive) / đăng xuất / connectGoogleDrive / disconnectGoogleDrive
│   └── google/
│       ├── client.ts     OAuth client theo user (timeout refresh; listener "tokens" không ghi lại sau khi ngắt kết nối)
│       ├── granted-scopes.ts  Scope user đã cấp (Account.scope): hasGoogleScope, requireGoogleScope, GoogleScopeMissingError · GOOGLE_ACCOUNT_ORDER (thứ tự chọn Account google, dùng chung với client.ts)
│       ├── drive-folders.ts  Drive cấp thấp: ensureRootFolder (thư mục gốc "Taskeo" tìm qua appProperties), createFolder, DriveFilesClient (chỉ import type googleapis)
│       ├── drive-provision.ts  provisionSpaceFolder / provisionProjectFolder: best-effort, hạn tổng 10 s, không bao giờ ném, chỉ import động client + googleapis khi đã có drive.file
│       ├── drive-storage.ts  getDriveStorageQuota: Drive `about.get` (`fields=storageQuota`), cùng khuôn kiểm scope / hạn 10 s / log an toàn như drive-files.ts
│       ├── drive-files.ts  listDriveFiles: files.list song song theo từng q, kiểm scope trước, hạn tổng 10 s, log an toàn
│       ├── deadline.ts   runWithDeadline: hạn tổng + AbortController, bỏ kết quả muộn (dùng chung cho drive-provision / drive-files)
│       ├── drive-query.ts  Thoát chuỗi q của Drive, rootFolderQuery, DRIVE_FOLDER_MIME
│       ├── drive-errors.ts  classifyDriveError / driveErrorLogFields: phân loại lỗi Drive, chỉ đọc name / code / status
│       ├── revoke.ts     Thu hồi quyền Google (POST /revoke, token trong body, timeout) · chọn token · phân loại kết quả · dữ liệu Account sau khi ngắt
│       └── scopes.ts     Scope theo giai đoạn (hằng số + parseScopes / hasScope thuần)
├── domain/            3. Logic nghiệp vụ thuần, có test, chạy được cả client lẫn server
│   ├── types.ts labels.ts       Kiểu dữ liệu + nhãn tiếng Việt
│   ├── validation.ts            Schema Zod dùng chung (storage + input API)
│   ├── space-record.ts          Bản ghi DB → Space phía client
│   ├── project-record.ts        Bản ghi DB → Project phía client, dueDate ↔ YYYY-MM-DD theo UTC
│   ├── task-record.ts           Bản ghi DB → Task phía client
│   ├── drive-folder-name.ts     toDriveFolderName: tên không gian / dự án → tên thư mục Drive
│   ├── drive-storage.ts         parseStorageQuota (int64 dạng chuỗi → byte), storagePercent, storageLevel (75 % / 90 %), formatBytes / formatStorageUsage kiểu vi-VN
│   ├── drive-files.ts           mimeType ↔ DocKind, chuỗi q liệt kê file, ánh xạ parents → không gian / dự án, gộp Tài liệu gần đây, escapeDriveQueryValue
│   ├── task-completion.ts       completedAtFor: quy tắc completedAt dùng chung cho server và store demo
│   ├── activity-record.ts       Bản ghi DB → Activity phía client; taskActivityTypes, activityRows (dòng activity cần ghi)
│   ├── workspace-actions.ts     Thao tác dữ liệu dạng hàm thuần
│   ├── task-filters.ts stats.ts dates.ts
│   ├── seed.ts                  Dữ liệu mẫu cho chế độ demo
│   └── *.test.ts
├── store/             4. State phía client
│   └── workspace-store.ts       Store chế độ demo (localStorage)
├── components/        5. UI dùng chung
│   ├── ui/                      Badge, modal, checkbox, SpaceIcon, SpaceStylePicker... + styles.ts
│   └── layout/                  App shell (bọc QueryProvider: query-provider.tsx): sidebar (kèm công tắc Google Drive: drive-switch.tsx), topbar, mobile nav, hộp thoại tạo mới, UI context, drive-status.ts, drive-notice.ts (thông báo ?drive=wrong-account | disconnected | disconnect-failed), khối dung lượng Google dưới công tắc Drive (drive-storage-meter.tsx; drive-storage-api.ts gọi /api/drive/storage, drive-storage-query.ts tuỳ chọn TanStack Query, use-drive-storage.ts, drive-storage-state.ts chọn trạng thái hidden / loading / error / ready)
├── features/          6. Màn hình theo nghiệp vụ
│   ├── dashboard/  tasks/  spaces/  projects/  docs/  calendar/
│   │   (docs/: drive-files-api.ts gọi /api/files, use-drive-files.ts hook TanStack Query, drive-files-state.ts chọn trạng thái demo / connect / loading / error / empty / list, drive-files-states.tsx lời mời kết nối Drive / khung chờ / khối lỗi)
├── app/               7. Chỉ routing (Next.js App Router), mỏng nhất có thể
│   ├── (auth)/login/            Trang đăng nhập
│   ├── (app)/                   Layout có sidebar + các trang
│   ├── api/auth/[...nextauth]/  Auth.js
│   ├── api/spaces/              CRUD không gian (route chỉ parse input, gọi server/spaces)
│   ├── api/spaces/[id]/projects/ Danh sách + tạo dự án trong không gian (gọi server/projects)
│   ├── api/projects/[id]/       Xem / sửa / xoá một dự án
│   ├── api/tasks/               Danh sách (lọc qua query) + tạo công việc (gọi server/tasks)
│   ├── api/tasks/[id]/          Xem / sửa / xoá một công việc
│   ├── api/activities/          Nhật ký hoạt động (gọi server/activities)
│   ├── api/files/               Liệt kê file Drive (gọi server/drive-files)
│   └── api/drive/storage/       Dung lượng Google Drive (gọi server/google/drive-storage)
└── proxy.ts           Chuyển về /login khi chưa có cookie phiên (chỉ khi bật auth)

scripts/
└── dev-create-doc.mjs  Chỉ dùng dev: tạo Doc/Sheet/Slide trống trong thư mục Drive của một không gian để kiểm T015 (sao chép logic giải mã của src/server/crypto.ts — đổi định dạng token thì sửa theo)
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
