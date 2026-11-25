# T006 · API CRUD Công việc (validate bằng Zod)

| | |
|---|---|
| Nhánh | `feat/T006-tasks-api` |
| Tạo từ | `develop` @ `9366d1d` |
| Trạng thái | 4-review |
| Ngày tạo | 2026-11-25 |

Nguồn: sheet nhiệm vụ, dòng **T22** (backlog B2, phần `tasks`). Theo cùng mẫu với T004 (không gian) và T005 (dự án).

## 1. Docs – yêu cầu

**Mục tiêu:** Công việc có đủ tạo / xem / sửa / xoá qua API route dùng Prisma + Zod, lọc theo người dùng, giữ ràng buộc "công việc thuộc dự án thì nằm cùng không gian với dự án". Chỉ phía server; giao diện vẫn chạy trên store demo (nối API ở T59).

**Hiện trạng:**
- Bảng `Task` trong Prisma đã đủ cột (`spaceId?`, `projectId?`, `title`, `description?`, `status`, `priority`, `dueDate?`, `completedAt?`, `calendarEventId?`, `order`); `space` `onDelete: Cascade`, `project` `onDelete: SetNull`; index `[userId, status]`, `[userId, dueDate]`, `[projectId]` → **không cần migration**.
- `domain/validation.ts` có `taskSchema` (dữ liệu localStorage), `taskStatusSchema`, `prioritySchema`, `projectDueDateSchema` (năm 1900–2100); chưa có schema input API cho công việc.
- Store demo (`domain/workspace-actions.ts`): `createTask` lấy `spaceId` theo dự án; `updateTask` không cho đổi `spaceId` trực tiếp, đổi `projectId` thì `spaceId` đi theo dự án, đổi `status` sang / khỏi `DONE` thì đặt / xoá `completedAt`.
- Có sẵn từ T004/T005: `getApiUserId()`, `server/http.ts` (`ok`, `fail`, `readJson`, `validationError`, `handleUnexpected`, `isValidRouteId`), `dueDateToDb` / `dueDateFromDb` (UTC), mẫu route `await connection()` + `import()` động.

**Phạm vi:**
- `domain/`:
  - Schema Zod `createTaskInputSchema` (`title` 1–200 sau trim, `description?` ≤ 5000, `status?`, `priority?`, `dueDate?` như dự án, `spaceId?` / `projectId?` là id hoặc `null`), `updateTaskInputSchema` (`.strict()`, ≥ 1 trường; nhận `title`, `description`, `status`, `priority`, `dueDate`, `projectId`; **không** nhận `spaceId`, `userId`, `id`, `order`, `completedAt`, `calendarEventId`, `createdAt`, `updatedAt`), `listTasksQuerySchema` (`spaceId?`, `projectId?`, `status?` từ query string).
  - Hàm thuần: `taskFromRecord` (bản ghi DB → `Task` client: mô tả `null` → `""`, `status` / `priority` lạ → `TODO` / `MEDIUM`, `dueDate` theo UTC, `completedAt` / `createdAt` / `updatedAt` ISO, `addToCalendar = calendarEventId !== null`, `linkedFileIds = []`); `completedAtFor(currentStatus, currentCompletedAt, nextStatus, now)` dùng chung quy tắc `completedAt`.
- `server/tasks.ts`: `listTasks(userId, filter)`, `getTask`, `createTask`, `updateTask`, `deleteTask`; mọi truy vấn lọc `userId`.
  - Tạo: có `projectId` → dự án phải của người dùng, `spaceId` lấy theo dự án; gửi kèm `spaceId` khác không gian của dự án → lỗi. Chỉ có `spaceId` → không gian phải của người dùng. Không có cả hai → công việc không thuộc không gian (`spaceId = null`, như demo).
  - Sửa: đổi `projectId` sang dự án khác → `spaceId` theo dự án đó; `projectId: null` → rời dự án, giữ `spaceId`. Đổi `status` → `completedAt` theo `completedAtFor`.
  - `order` = `max(order) + 1` trong cùng người dùng; `MAX_TASKS_PER_USER = 2000` (vượt → 409), `listTasks` `take` đúng hằng này, sắp `order`, `createdAt`.
- API route:
  - `GET /api/tasks?spaceId=&projectId=&status=` — danh sách công việc (lọc tuỳ chọn); `POST /api/tasks` — tạo.
  - `GET/PATCH/DELETE /api/tasks/[id]`.
  - Mã lỗi theo quy ước T004/T005: 401 chưa đăng nhập · 503 chế độ demo / misconfigured · 400 JSON hỏng, input / query sai, **không gian / dự án trong body không có hoặc của người khác**, `spaceId` không khớp không gian của dự án · 404 công việc không có, của người khác hoặc id sai định dạng · 409 vượt giới hạn · `DELETE` → 204.

**Ngoài phạm vi:**
- Đổi `spaceId` trực tiếp bằng PATCH (giữ quy tắc của demo: không gian đi theo dự án).
- Gắn file Drive (`TaskFile`, T60), đẩy hạn lên Calendar (`calendarEventId`, T39), ghi `Activity` (T27).
- Nối giao diện vào API (T59); sắp xếp `order` bằng kéo thả; phân trang; rate limit (T73); test e2e (T61).

**Tiêu chí nghiệm thu** (mỗi dòng kiểm tra được):
- [ ] `GET /api/tasks` và `POST /api/tasks` khi chưa đăng nhập trả 401; ở chế độ demo trả 503 (không import `@/server/tasks`).
- [ ] `POST /api/tasks` với tiêu đề rỗng / 201 ký tự, `status` / `priority` lạ, `dueDate` sai hoặc `2026-02-31`, key thừa (`userId`, `order`, `completedAt`) hoặc JSON hỏng trả 400; hợp lệ trả 201 kèm công việc mới đủ trường của `Task`.
- [ ] `POST` với `projectId` của người khác hoặc không có, `spaceId` của người khác, hoặc `spaceId` khác không gian của dự án trả 400; chỉ gửi `projectId` thì `spaceId` của công việc = không gian của dự án.
- [ ] `POST` / `PATCH` với `status: "DONE"` đặt `completedAt`; chuyển khỏi `DONE` đặt `completedAt = null`; PATCH không đổi `status` thì giữ `completedAt`.
- [ ] `GET/PATCH/DELETE /api/tasks/[id]` với id của người khác, không có hoặc quá dài trả 404 và không đổi dữ liệu (test kiểm mọi truy vấn Prisma có `userId`).
- [ ] `PATCH` chỉ đổi các trường gửi lên; `PATCH {}` và `PATCH { spaceId }` trả 400; `projectId` sang dự án ở không gian khác → `spaceId` đổi theo; `projectId: null` giữ `spaceId`; `DELETE` trả 204 body rỗng.
- [ ] `GET /api/tasks?spaceId=…&status=…` chỉ trả công việc của người dùng khớp bộ lọc; `status` lạ trong query trả 400.
- [ ] Có unit test cho schema, `taskFromRecord`, `completedAtFor`, `server/tasks.ts`; có test route handler (mock `auth` + Prisma) phủ 401 / 503 / 400 / 404 / 409 / thành công.
- [ ] typecheck, lint, test, build xanh.

**Tài liệu bị ảnh hưởng:** 04 kiến trúc (thêm `server/tasks.ts`, `domain/task-record.ts`, `app/api/tasks`), 06 API (bảng route mới, quy ước công việc).

## 2. Kế hoạch từng phần

Phát hiện khi lập kế hoạch:
- Bẫy của T004/T005 vẫn áp dụng: `await connection()` dòng đầu mọi GET (không bọc try/catch); `params` là `Promise`; chỉ `import()` động `@/server/tasks` sau khi `getApiUserId()` ok; `z.strictObject`, không `.default()`, PATCH `.refine` ≥ 1 trường; DELETE `new Response(null, { status: 204 })`; mô tả `""` → `null`, đọc `null` → `""`; ngày chỉ qua `dueDateToDb` / `dueDateFromDb`; mọi truy vấn có `userId`.
- `dueDate` dùng lại `projectDueDateSchema` (năm 1900–2100, chặn ngày không có thật); không chuyển `dueDateToDb` / `dueDateFromDb` khỏi `project-record.ts`.
- Id trong body / query: `domain/` không import được `server/http.ts` (`server-only`) → thêm `ID_MAX_LENGTH = 64` + `entityIdSchema` trong `validation.ts`, `http.ts` dùng lại hằng này. Id quá dài trong body / query → 400; trên URL `[id]` → 404 như cũ.
- Query string: không dùng `Object.fromEntries` (nuốt giá trị lặp). Hàm thuần `queryToObject(params, keys)` dựng object bằng `getAll`. Route đọc `new URL(request.url).searchParams` (test truyền `Request` thường).
- `completedAtFor<T>` generic (server dùng `Date`, demo dùng chuỗi ISO), file riêng `domain/task-completion.ts`; dùng luôn trong `createTask` / `updateTask` của demo để bỏ lặp, test cũ là test hồi quy.
- Khoá ngoại không kiểm `userId` → `server/tasks.ts` tự kiểm dự án / không gian thuộc người dùng trước khi ghi. Dự án bị xoá giữa lúc kiểm và ghi → Prisma `P2003` → bắt bằng `error.code` → 400, không ra 500.
- PATCH: `projectId`, `spaceId` đi theo, `completedAt` và các trường gửi lên gộp trong **một** `updateMany({ where: { id, userId } })`; `completedAt` chỉ vào `data` khi có `status`.
- `count` → `aggregate` → `create` không atomic (có thể vượt 2000 một chút, trùng `order`); đọc `status` rồi ghi `completedAt` cũng vậy. Chấp nhận như R4/R6 của T005, ghi docs 06.
- `@updatedAt` qua `updateMany` không kiểm được bằng mock → kiểm trên DB `dev` ở bước 7.

Quyết định cho chỗ spec chưa nói (Claude chốt, người dùng duyệt cùng kế hoạch):
1. Query: chuỗi rỗng (`?spaceId=`) coi như không gửi; một key lặp nhiều lần → 400; key lạ bỏ qua (không 400, để tham số chống cache không lỗi).
2. Lọc theo không gian / dự án không có hoặc của người khác → 200 `[]` (không 404, không lộ id tồn tại, bớt một truy vấn).
3. `POST { projectId, spaceId: null }` → coi như không gửi `spaceId`, lấy theo dự án. `spaceId` trùng không gian của dự án → hợp lệ.
4. `PATCH { projectId: <dự án lạ / của người khác> }` → 400 (giống POST), có test.
5. `addToCalendar` không nhận ở input (strict → 400); luôn suy ra từ `calendarEventId` (T39).
6. Chưa lọc được công việc không thuộc không gian (`spaceId = null`) qua query → việc để sau.

| Phần | Việc | File | Agent | Test cần viết (trước) | Phụ thuộc |
|---|---|---|---|---|---|
| P1 | `TASK_TITLE_MAX = 200`, `TASK_DESCRIPTION_MAX = 5000`, `ID_MAX_LENGTH = 64`, `entityIdSchema`; `createTaskInputSchema` (`title`, `description?`, `status?`, `priority?`, `dueDate?`, `spaceId?` / `projectId?` id hoặc `null`); `updateTaskInputSchema` (strict, ≥ 1 trường: `title`, `description`, `status`, `priority`, `dueDate`, `projectId`); `listTasksQuerySchema` (rỗng → undefined, key lạ bỏ qua) + `queryToObject` (lặp → lỗi); kiểu `CreateTaskInput` / `UpdateTaskInput` / `ListTasksQuery` | `src/domain/validation.ts` + test | feature-builder | từ chối title rỗng / chỉ khoảng trắng / 201 ký tự, mô tả 5001, status / priority lạ, `2026-02-31`, `1899-12-31`, key thừa (`userId`, `order`, `completedAt`, `calendarEventId`, `addToCalendar`, `id`, `createdAt`, `updatedAt`), `spaceId` trong PATCH, id 65 ký tự, `PATCH {}`; nhận `dueDate: null`, `projectId: null`; `{title}` không sinh trường khác; query `status=FOO` lỗi, `""` → undefined, lặp lỗi, key lạ bỏ qua | — |
| P2 | `completedAtFor<T>`; thay logic `completedAt` trong `createTask` / `updateTask` của demo | mới `src/domain/task-completion.ts` + test; `src/domain/workspace-actions.ts` | feature-builder | với `Date` và chuỗi: TODO→DONE = now; DONE→TODO = null; DONE→DONE giữ; status undefined giữ; IN_PROGRESS→PAUSED giữ null; `workspace-actions.test.ts` vẫn xanh | — |
| P3 | `TaskRecord` + `taskFromRecord` (mô tả null → `""`, status / priority lạ → TODO / MEDIUM, `dueDateFromDb`, ISO cho `completedAt` / `createdAt` / `updatedAt`, `addToCalendar = calendarEventId !== null`, `linkedFileIds = []`, bỏ trường thừa); không import Prisma | mới `src/domain/task-record.ts` + test | feature-builder | ổn định khi `TZ` = Asia/Ho_Chi_Minh, America/Los_Angeles; null hai chiều; fallback status / priority; `addToCalendar`; kết quả qua `taskSchema`; không lộ `userId` / `order` | — |
| P4 | `MAX_TASKS_PER_USER = 2000`; `listTasks`, `getTask`, `createTask` (kiểm dự án / không gian, mismatch, limit, `order` max+1, `completedAt`, P2003), `updateTask` (projectId kéo `spaceId`, null giữ `spaceId`, `completedAt`, một `updateMany`, P2003), `deleteTask` (`deleteMany`); `http.ts` dùng `ID_MAX_LENGTH` | mới `src/server/tasks.ts` + test; `src/server/http.ts` | api-builder | mọi lời gọi Prisma có `userId`; dự án / không gian của người khác → đúng reason, không gọi create / updateMany; `space_mismatch`; chỉ `projectId` → `spaceId` theo dự án; không có cả hai → `spaceId: null`; đủ 2000 → `limit`; `order` 0 / max+1; `take`, `orderBy`; filter chỉ thêm khoá có mặt; PATCH không gửi `undefined`, không đổi status → không có `completedAt`; P2003 → reason 400, lỗi khác ném tiếp; `count 0` → `not_found` | P1, P2, P3 |
| P5 | `GET /api/tasks` (query qua `queryToObject` + schema), `POST /api/tasks` | mới `src/app/api/tasks/route.ts` + test | api-builder | GET gọi `connection()`; 401; 503 không import server; 400 query (status lạ, lặp, id quá dài); GET 200 truyền đúng filter; POST 400 (title, status, priority, dueDate, key thừa, JSON hỏng, `invalid_project`, `invalid_space`, `space_mismatch`); 409 limit; 201 đủ trường `Task`; 500 không lộ chi tiết | P4 |
| P6 | `GET/PATCH/DELETE /api/tasks/[id]` | mới `src/app/api/tasks/[id]/route.ts` + test | api-builder | 401 / 503; 404 id lạ / của người khác / 65 ký tự (không gọi server); PATCH 400 `{}`, `{spaceId}`, key thừa, JSON hỏng, `invalid_project`; PATCH 200 chỉ trường đã gửi; DELETE 204 body rỗng; 500 | P4 |

Thứ tự (cùng đợt = khác file, chạy song song): đợt 1 P1 + P2 + P3 → đợt 2 P4 → đợt 3 P5 + P6. Docs 04 / 06 cập nhật ở bước 7, kèm kiểm thật trên DB `dev` (`@updatedAt`, P2003, `spaceId` đi theo dự án).

Rủi ro / phụ thuộc:
- Mass assignment: strict phải chặn từng key nêu ở P1.
- Gắn vào dự án / không gian của người khác qua khoá ngoại nếu quên kiểm sở hữu → P4 test bắt buộc.
- Race kiểm-rồi-ghi (P2003 phải thành 400), đếm-rồi-tạo, đọc-status-rồi-ghi → chấp nhận, ghi docs 06.
- P2 đổi code demo: sai sẽ đổi hành vi `completedAt` của giao diện → chạy đủ `workspace-actions.test.ts`.
- Lệch ngày theo múi giờ → chỉ dùng `dueDateToDb` / `dueDateFromDb`, P3 test đổi `TZ`.
- Chưa có rate limit / giới hạn body (T73), phân trang (`take: 2000`).

Duyệt kế hoạch: ☐ chờ · ☒ người dùng đã duyệt (2026-11-25) · ☐ bỏ qua (`--yes`)

## 3. Thực hiện + kiểm thử

| Phần | Commit | Test thêm | typecheck | lint | test | build |
|---|---|---|---|---|---|---|
| P1 | `2fb85d4` | `validation.test.ts` (+73) | ✅ | ✅ | ✅ 457/457 | ✅ |
| P2 | `dc312bb` | `task-completion.test.ts` (12) | ✅ | ✅ | ✅ 457/457 | ✅ |
| P3 | `a6f5d05` | `task-record.test.ts` (11) | ✅ | ✅ | ✅ 457/457 | ✅ |
| P4 | `f5ac8b4` | `tasks.test.ts` (38) | ✅ | ✅ | ✅ 495/495 | ✅ |
| P5 | `e16e0f6` | `tasks/route.test.ts` (27) | ✅ | ✅ | ✅ 555/555 | ✅ |
| P6 | `85d31b4` | `tasks/[id]/route.test.ts` (33) | ✅ | ✅ | ✅ 555/555 | ✅ |

## 4. Review code

Reviewer đã chạy:

| # | Mức | File:dòng | Vấn đề | Reviewer |
|---|---|---|---|---|
| R1 | | | | |

## 5. Fix bug

| Phát hiện | Xử lý | Commit |
|---|---|---|
| R1 | đã sửa / bỏ qua: lý do | |

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
