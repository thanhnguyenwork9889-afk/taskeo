# 06 · API

## Hiện có

| Route | File | Việc |
|---|---|---|
| `/api/auth/*` | `src/app/api/auth/[...nextauth]/route.ts` | Auth.js (đăng nhập Google, callback, session) |
| Server action `signInWithGoogle`, `signOutAction` | `src/server/auth/actions.ts` | Đăng nhập / đăng xuất từ giao diện |
| `GET /api/spaces` | `src/app/api/spaces/route.ts` | Danh sách không gian của người dùng (tối đa 200) |
| `POST /api/spaces` | `src/app/api/spaces/route.ts` | Tạo không gian. Body `{ name, description?, color?, icon? }` → 201; 409 khi đã có 200 không gian. Đã kết nối Drive → tạo thư mục Drive, `driveFolderId` trong phản hồi; Drive lỗi vẫn 201 với `driveFolderId: null` (T013) |
| `GET /api/spaces/[id]` | `src/app/api/spaces/[id]/route.ts` | Một không gian → 200 / 404 |
| `PATCH /api/spaces/[id]` | `src/app/api/spaces/[id]/route.ts` | Sửa các trường gửi lên (≥ 1 trường) → 200 / 404 |
| `DELETE /api/spaces/[id]` | `src/app/api/spaces/[id]/route.ts` | Xoá không gian, kéo theo dự án và công việc (cascade) → 204 / 404 |
| `GET /api/spaces/[id]/projects` | `src/app/api/spaces/[id]/projects/route.ts` | Dự án của không gian (tối đa 200) → 200 / 404 không gian lạ |
| `POST /api/spaces/[id]/projects` | `src/app/api/spaces/[id]/projects/route.ts` | Tạo dự án. Body `{ name, description?, status?, dueDate? }` → 201; 404 không gian lạ; 409 trùng tên trong không gian hoặc đã có 200 dự án (giới hạn xét trước trùng tên). Đã kết nối Drive → tạo thư mục con, lưu `Project.driveFolderId` (không trả ra client); Drive lỗi vẫn 201 (T013) |
| `GET /api/projects/[id]` | `src/app/api/projects/[id]/route.ts` | Một dự án → 200 / 404 |
| `PATCH /api/projects/[id]` | `src/app/api/projects/[id]/route.ts` | Sửa các trường gửi lên (≥ 1 trường) → 200 / 404 / 409 đổi tên trùng. Không đổi được `spaceId` |
| `DELETE /api/projects/[id]` | `src/app/api/projects/[id]/route.ts` | Xoá dự án; công việc giữ lại trong không gian với `projectId = null` (`onDelete: SetNull`) → 204 / 404 |
| `GET /api/tasks` | `src/app/api/tasks/route.ts` | Công việc của người dùng (tối đa 2000), lọc tuỳ chọn `?spaceId=&projectId=&status=` → 200; 400 query sai hoặc một tham số gửi lặp |
| `POST /api/tasks` | `src/app/api/tasks/route.ts` | Tạo công việc. Body `{ title, description?, status?, priority?, dueDate?, spaceId?, projectId? }` → 201; 400 dự án / không gian không có hoặc của người khác, `spaceId` khác không gian của dự án; 409 khi đã có 2000 công việc |
| `GET /api/tasks/[id]` | `src/app/api/tasks/[id]/route.ts` | Một công việc → 200 / 404 |
| `PATCH /api/tasks/[id]` | `src/app/api/tasks/[id]/route.ts` | Sửa các trường gửi lên (≥ 1 trường: `title`, `description`, `status`, `priority`, `dueDate`, `projectId`) → 200 / 404 / 400 dự án lạ. Không nhận `spaceId` |
| `DELETE /api/tasks/[id]` | `src/app/api/tasks/[id]/route.ts` | Xoá công việc → 204 / 404 |
| `GET /api/activities` | `src/app/api/activities/route.ts` | Nhật ký hoạt động của người dùng, mới nhất trước. `?limit=` số nguyên 1–200 (mặc định 50) → 200; 400 `limit` sai hoặc gửi lặp |
| `GET /api/files` | `src/app/api/files/route.ts` | File Google Docs / Sheets / Slides trong thư mục Drive Taskeo của user, mới sửa nhất trước (T015). `?spaceId=` (gồm thư mục dự án con) hoặc `?projectId=` (không gửi cùng lúc), `?kind=doc\|sheet\|slide`, `?limit=` 1–100 (mặc định 20) → 200 `{ files: DriveFileItem[] }` (`id, name, kind, url, modifiedAt, spaceId, projectId, spaceName, projectName`); 400 tham số sai / gửi lặp; 403 `code: "drive_not_connected"` chưa kết nối Drive; 404 không gian / dự án lạ; 502 Google lỗi / quá hạn |

### Quy ước chung (từ T004)

- Phản hồi: `{ data, error }`. Lỗi: `{ data: null, error: { message, details?, code? } }`, `details` là `z.flattenError` khi input sai; `code` là mã máy đọc cho lỗi giao diện cần xử lý riêng (hiện chỉ `drive_not_connected`, T015).
- Mã lỗi: 400 JSON hỏng hoặc input sai (schema `.strict()`, không nhận `userId`, `id`, `order`, `driveFolderId`) · 401 chưa đăng nhập · 404 không có, của người khác hoặc id sai định dạng (không phân biệt) · 403 chưa kết nối Google Drive (`error.code = "drive_not_connected"`, T015) · 502 Google lỗi / quá hạn (T015) · 503 chế độ demo / thiếu cấu hình (không có DB) · 500 thông báo chung, chỉ log `name`, `message`, `stack`.
- `color` phải thuộc `SPACE_PALETTE`, `icon` thuộc `SPACE_ICONS` (`src/domain/labels.ts`); bỏ trống thì server chọn mặc định. Mô tả rỗng lưu `null`.
- Dự án (T005): `status` thuộc `ACTIVE | ON_HOLD | DONE | ARCHIVED`; `dueDate` là `YYYY-MM-DD` có thật, năm 1900–2100, hoặc `null`; lưu nửa đêm UTC, đọc lại theo UTC. Tên trùng so không phân biệt hoa thường (`ILIKE` đã thoát `\ % _`), kèm bắt lỗi unique `P2002` của DB.
- Kiểm trùng tên rồi mới ghi, không atomic: hai request đồng thời khác hoa thường có thể cùng qua (unique của DB chỉ chặn trùng chính xác).
- Công việc (T006):
  - Trường: `title` 1–200 ký tự, `description` ≤ 5000 (rỗng lưu `null`), `status` thuộc `TODO | IN_PROGRESS | PAUSED | DONE`, `priority` thuộc `LOW | MEDIUM | HIGH | URGENT`, `dueDate` như dự án. Chuỗi và id có ký tự NUL bị từ chối (Postgres không lưu được). Schema strict không nhận `userId`, `id`, `order`, `completedAt`, `calendarEventId`, `addToCalendar`, `createdAt`, `updatedAt`; PATCH không nhận `spaceId`.
  - Vị trí: có `projectId` → `spaceId` lấy theo dự án (`spaceId: null` coi như không gửi; gửi `spaceId` khác → 400). Chỉ có `spaceId` → không gian phải của người dùng. Không có cả hai → công việc không thuộc không gian. PATCH đổi `projectId` → `spaceId` đổi theo; `projectId: null` → rời dự án, giữ `spaceId`.
  - `completedAt` do server đặt: chuyển sang `DONE` → thời điểm hiện tại, chuyển khỏi `DONE` → `null`, status không đổi → giữ nguyên.
  - Phản hồi: kiểu `Task` của client; `addToCalendar` suy từ `calendarEventId`, `linkedFileIds` luôn `[]` (chưa nối `TaskFile`, T60).
  - Query `GET /api/tasks`: chuỗi rỗng coi như không gửi, tham số lạ bị bỏ qua, một tham số gửi nhiều lần → 400. Lọc theo không gian / dự án không có hoặc của người khác → 200 `[]` (không phân biệt). Id quá dài / có NUL trong body hoặc query → 400; trên URL → 404.
  - Không atomic, chấp nhận: kiểm dự án rồi ghi (dự án bị xoá giữa chừng → lỗi khoá ngoại `P2003` → 400), đếm rồi tạo (có thể vượt 2000 một chút, trùng `order`), đọc status rồi ghi `completedAt`.
  - Chưa có: phân trang, lọc công việc không thuộc không gian.
- Activity (T008):
  - Ghi tự động trong cùng `prisma.$transaction` (interactive) với thay đổi: `POST /api/tasks` → `task_created` (+ `task_done` nếu tạo với `DONE`); `PATCH /api/tasks/[id]` đổi status từ khác `DONE` sang `DONE` → `task_done`; `POST /api/spaces/[id]/projects` → `project_created`. Ghi activity lỗi → cả thay đổi bị rollback (đã kiểm trên DB `dev`). Request lỗi 400 / 404 / 409 không ghi gì.
  - Không ghi: các sửa khác (tiêu đề, ưu tiên, hạn… — `task_updated` để sau), DONE → DONE, chuyển khỏi `DONE`, xoá, không gian.
  - Phản hồi: kiểu `Activity` `{ id, type, entityId, message, createdAt }`; `type` lạ trong DB bị bỏ (có thể trả ít hơn `limit`). Sắp `createdAt` giảm dần rồi `id` giảm dần.
  - Không atomic, chấp nhận: đọc status rồi ghi — hai PATCH `DONE` đồng thời có thể ghi 2 `task_done` (`completionsByDay` vẫn đếm mỗi công việc một lần).
- Chưa có: rate limit, giới hạn kích thước body, kiểm tra `Content-Type` / `Origin` (T73).
- Giao diện vẫn dùng store demo; nối vào API ở T59.

`src/proxy.ts` chỉ kiểm tra lạc quan (có cookie phiên hay không). Kiểm tra thật nằm ở `getViewer()` và ở từng API route (`auth()`).

## Giai đoạn 2 (chưa làm)

- Đã có API `spaces`, `projects`, `tasks` (T004–T006) và nhật ký `activities` (T008). Còn lại: phân trang, gắn file Drive vào công việc, nối card Hoạt động vào API (T41).
- Logic truy vấn đặt ở `src/server/`, route trong `src/app/api/` chỉ parse input, gọi hàm server và trả kết quả.
- Thay `src/store/workspace-store.ts` bằng TanStack Query gọi API. Giao diện chỉ phụ thuộc `useWorkspace()` / `updateWorkspace()`, nên các file trong `features/` không phải sửa.
- Khi trang render từ dữ liệu server, đổi `experimental.instantInsights.validationLevel` trong `next.config.ts` về `"warning"`.
