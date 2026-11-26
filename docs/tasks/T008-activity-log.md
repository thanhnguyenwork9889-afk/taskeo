# T008 · Ghi Activity khi tạo / hoàn thành công việc, tạo dự án

| | |
|---|---|
| Nhánh | `feat/T008-activity-log` |
| Tạo từ | `develop` @ `826686a` |
| Trạng thái | 5-fix |
| Ngày tạo | 2026-11-26 |

Nguồn: sheet nhiệm vụ, dòng **T27** (backlog B4, phần ghi). Hiển thị thật ở card Hoạt động là T41, chờ nối giao diện vào API (T59).

## 1. Docs – yêu cầu

**Mục tiêu:** Khi người dùng tạo công việc, hoàn thành công việc hoặc tạo dự án qua API, server ghi một dòng `Activity` vào DB cùng lúc với thay đổi đó, và có route đọc lại nhật ký để card Hoạt động dùng sau này (T41/T59). Kiểu, `entityId` và câu thông báo giống hệt store demo, để `completionsByDay` chạy như nhau ở hai chế độ.

**Hiện trạng:**
- Bảng `Activity` đã có (`userId`, `type`, `entityId?`, `meta Json?`, `createdAt`, index `[userId, createdAt]`, `[entityId]`) → **không cần migration**. Hiện chưa chỗ nào ghi.
- Store demo (`domain/workspace-actions.ts`) ghi `task_created` "Tạo công việc" (thêm `task_done` "Hoàn thành công việc" nếu tạo sẵn `DONE`), `task_updated` + `task_done` khi chuyển sang `DONE`, `project_created` "Tạo dự án", `doc_created`. Kiểu client `Activity { id, type, entityId, message, createdAt }`.
- `completionsByDay` (`domain/stats.ts`) chỉ đếm `task_done`, bỏ công việc không còn `DONE`, mỗi công việc tính một lần.
- `server/tasks.ts` (`createTask`, `updateTask`) và `server/projects.ts` (`createProject`) đang ghi bằng một lệnh Prisma, chưa dùng transaction.

**Phạm vi:**
- `domain/`: hằng câu thông báo dùng chung (`ACTIVITY_MESSAGE`), demo dùng lại hằng này (không đổi hành vi); hàm thuần `activityFromRecord` (bản ghi DB → `Activity` client: `type` lạ bị loại, `meta.message` không có / sai kiểu → câu mặc định theo `type`, `createdAt` ISO); hàm thuần quyết định cần ghi gì cho một thay đổi công việc; schema query `limit`.
- `server/`:
  - `createTask`: ghi `task_created`, và thêm `task_done` khi tạo với `status: "DONE"`, trong **cùng transaction** với `task.create`.
  - `updateTask`: khi `status` đổi từ khác `DONE` sang `DONE` → ghi `task_done` trong cùng transaction với `updateMany`. Không đổi status, hoặc gửi `DONE` khi đã `DONE` → không ghi.
  - `createProject`: ghi `project_created` trong cùng transaction với `project.create`.
  - `listActivities(userId, limit)`: mới nhất trước, lọc `userId`.
  - Lỗi khi ghi activity → cả thay đổi bị huỷ (không có công việc / dự án mà thiếu nhật ký); mã lỗi trả về giữ như cũ (P2003 → 400, P2002 → 409).
- API route mới `GET /api/activities?limit=` → 200 danh sách `Activity` (mặc định 50, tối đa 200); 401 / 503 / 400 theo quy ước T004.

**Ngoài phạm vi:**
- `task_updated` cho các sửa khác (tiêu đề, ưu tiên, hạn…): demo lấy câu thông báo từ giao diện; server sinh câu riêng để việc sau.
- `doc_created` (cần Drive, T32), activity cho không gian.
- Xoá activity khi xoá công việc / dự án (không có khoá ngoại; `completionsByDay` đã bỏ công việc không còn `DONE`).
- Nối card Hoạt động vào API (T41/T59), phân trang theo con trỏ, lọc theo `type`.

**Tiêu chí nghiệm thu** (mỗi dòng kiểm tra được):
- [ ] `POST /api/tasks` thành công ghi đúng một `Activity` `task_created` (`entityId` = id công việc, `meta.message` = "Tạo công việc"); tạo với `status: "DONE"` ghi thêm `task_done` "Hoàn thành công việc".
- [ ] `PATCH /api/tasks/[id]` chuyển sang `DONE` ghi một `task_done`; PATCH không có `status`, `status` khác `DONE`, hoặc `DONE` khi đã `DONE` không ghi activity.
- [ ] `POST /api/spaces/[id]/projects` thành công ghi một `project_created` "Tạo dự án".
- [ ] Ghi công việc / dự án và ghi activity nằm trong một `prisma.$transaction`; activity lỗi thì không có bản ghi nào (test mock kiểm), và các lỗi 400 / 404 / 409 cũ không ghi activity.
- [ ] Mọi bản ghi `Activity` có `userId` của người gọi; `listActivities` lọc `userId`, sắp `createdAt` giảm dần, `take` = `limit`.
- [ ] `GET /api/activities`: 401 chưa đăng nhập, 503 chế độ demo (không import `@/server/activities`), 400 `limit` không phải số nguyên 1–200 hoặc gửi lặp, 200 trả mảng `Activity` đủ trường `{ id, type, entityId, message, createdAt }`.
- [ ] `activityFromRecord` có unit test (meta thiếu / sai kiểu, type lạ); test cũ của `workspace-actions` vẫn xanh sau khi dùng `ACTIVITY_MESSAGE`.
- [ ] Kiểm trên DB `dev`: tạo công việc, hoàn thành nó, tạo dự án → thấy 3 dòng `Activity` và `GET /api/activities` trả chúng.
- [ ] typecheck, lint, test, build xanh.

**Tài liệu bị ảnh hưởng:** 03 DB (cách dùng `Activity.meta`), 04 kiến trúc (`server/activities.ts`, `domain/activity-record.ts`, `app/api/activities`), 06 API (route mới, quy ước ghi activity).

## 2. Kế hoạch từng phần

Phát hiện khi lập kế hoạch:
- `$transaction` dạng **interactive** (callback), không dạng mảng: `Activity` không có quan hệ tới `Task` / `Project` nên không tạo lồng được, activity cần id mới làm `entityId`; dạng mảng còn ghi activity khi `updateMany` trả `count: 0`. Mẫu: `prisma.$transaction(async (tx) => { const r = await tx.task.create(...); await tx.activity.createMany(...); return r; })`.
- Trong callback chỉ gọi `tx.*`. Kiểm sở hữu, `count`, `aggregate`, `nameTaken` giữ **trước** transaction; `getTask` đọc lại **sau** commit. Transaction chỉ bọc lệnh ghi + activity (ngắn, hợp Neon pooler, timeout 5 s).
- P2003 / P2002 bắt **ngoài** `$transaction` (callback ném → Prisma rollback, ném lại lỗi gốc còn `code`). Không nuốt lỗi trong callback.
- Activity không thể ra P2003 riêng (khoá ngoại duy nhất là `userId`, đã bị khoá bởi insert trước) → map P2003 như cũ.
- `updateMany` trong tx: `count === 0` → trả `not_found` trong callback trước khi ghi activity. Nhánh "data rỗng" không mở transaction.
- Truyền `createdAt: now` cho activity (khớp `completedAt`); `createProject` thêm tham số `now`. `listActivities` sắp thêm `id desc` cho ổn định.
- Mock: object `tx = { task: { create, updateMany }, activity: { createMany } }`, `db.$transaction.mockImplementation(async (fn) => fn(tx))` đặt lại sau `vi.resetAllMocks()`; bỏ `create` / `updateMany` khỏi `db.task` để gọi nhầm ngoài tx thì test hỏng. `expectAllWhereHaveUserId` kiểm cả `data[i].userId` của `activity.createMany`.
- Mock không rollback được: test kiểm ghi và activity qua cùng một `tx`, activity reject → hàm ném lại. Rollback thật kiểm trên DB `dev` ở bước 7.
- Route: 503 dùng mẫu `freshRoute` của `tasks/route.test.ts`; query qua `queryToObject(searchParams, ["limit"])`. `limit` không dùng `z.coerce.number` (nhận `1e2`, ` 5`, `0x10`) → regex `^\d+$` rồi `int().min(1).max(200)`.

Quyết định cho chỗ spec chưa nói (Claude chốt, người dùng duyệt cùng kế hoạch):
1. `ACTIVITY_TYPES` + `ACTIVITY_MESSAGE: Record<ActivityType, string>` ở `domain/labels.ts`; `activitySchema` dùng `z.enum(ACTIVITY_TYPES)`.
2. Câu mặc định: "Tạo công việc", "Hoàn thành công việc", "Cập nhật công việc", "Tạo dự án", "Tạo tài liệu". Demo `updateTask` vẫn dùng câu giao diện truyền vào.
3. Server luôn ghi `meta = { message }`, dùng `tx.activity.createMany` ở cả 3 chỗ.
4. Hàm thuần `taskActivityTypes(previous: TaskStatus | null, next)`: tạo → `task_created` (+ `task_done` nếu DONE); sửa → `task_done` khi khác DONE → DONE, ngoài ra `[]`.
5. `?limit=` rỗng / không gửi → 50; `050` → 50; `0`, `201`, `1.5`, `-1`, `abc`, lặp → 400.
6. `listActivities`: `where: { userId }`, `orderBy: [createdAt desc, id desc]`, `take: limit`; bản ghi `type` lạ bị loại sau khi đọc (có thể trả ít hơn `limit`).
7. `activityFromRecord` trả `Activity | null`; `meta.message` chỉ dùng khi là chuỗi khác rỗng.
8. Hai PATCH DONE đồng thời có thể ghi 2 `task_done` — chấp nhận (`completionsByDay` đếm mỗi công việc một lần), ghi docs 06.

| Phần | Việc | File | Agent | Test cần viết (trước) | Phụ thuộc |
|---|---|---|---|---|---|
| P1 | `ACTIVITY_TYPES`, `ACTIVITY_MESSAGE`; `activityTypeSchema`; `listActivitiesQuerySchema`, `ACTIVITY_LIST_DEFAULT/MAX`; demo dùng `ACTIVITY_MESSAGE` | `src/domain/labels.ts`, `src/domain/validation.ts` (+ test), `src/domain/workspace-actions.ts` | feature-builder | đủ 5 type; `limit` thiếu / rỗng → 50, `1`, `200`, `050` ok; `0`, `201`, `1.5`, `-1`, `1e2`, ` 5`, `abc` lỗi; test demo cũ xanh | — |
| P2 | `ActivityRecord`, `activityFromRecord`, `taskActivityTypes` | mới `src/domain/activity-record.ts` + test | feature-builder | meta null / không phải object / message số / rỗng → câu mặc định; type lạ → null; ISO; các chuyển trạng thái | P1 |
| P3 | `createProject` bọc `$transaction`, ghi `project_created`, thêm `now` | `src/server/projects.ts` + test | api-builder | mock tx; thành công → 1 activity đúng trường trong cùng tx; P2002 → conflict; activity lỗi → ném lại; not_found / limit / trùng tên không gọi `$transaction` | P1 |
| P4 | `createTask` / `updateTask` bọc `$transaction`, ghi theo `taskActivityTypes` | `src/server/tasks.ts` + test | api-builder | tạo → `task_created`; tạo DONE → thêm `task_done`; TODO→DONE → `task_done`; các trường hợp khác không ghi; P2003 / count 0 không ghi; activity lỗi → ném lại; userId ở mọi `data` | P2 |
| P5 | `listActivities(userId, limit)` | mới `src/server/activities.ts` + test | api-builder | where / orderBy / take / select; loại type lạ; không lộ `userId` / `meta` | P2 |
| P6 | `GET /api/activities?limit=` | mới `src/app/api/activities/route.ts` + test | api-builder | `connection()`; 401; 503 không import server; 400 limit sai / lặp; 200 mặc định 50; body đủ 5 trường; 500 không lộ chi tiết | P1, P5 |

Thứ tự: P1 → (P2 ∥ P3) → (P4 ∥ P5) → P6. Docs 03 / 04 / 06 và kiểm thật trên DB `dev` ở bước 7.

Rủi ro / phụ thuộc:
- Gọi nhầm `prisma.*` trong callback → ghi ngoài transaction; mock `tx` tách riêng bắt được, reviewer kiểm lại.
- Rollback thật chỉ kiểm được trên DB `dev`.
- Interactive tx trên Neon pooler (timeout 5 s); gặp P2028 thì xem lại.
- P3 / P4 sửa mock dùng chung, dễ làm đỏ test cũ hàng loạt.
- Race PATCH DONE đồng thời và đếm-rồi-tạo còn như T006; chưa phân trang con trỏ (T41 / T59), chưa rate limit (T73).

Duyệt kế hoạch: ☑ người dùng đã duyệt (2026-11-26)

## 3. Thực hiện + kiểm thử

| Phần | Commit | Test thêm | typecheck | lint | test | build |
|---|---|---|---|---|---|---|
| P1 | `ab27a20` | `validation.test.ts`: activity types, `listActivitiesQuerySchema` | ✅ | ✅ | ✅ 605 | ✅ |
| P2 | `4f67809` | mới `activity-record.test.ts` (32) | ✅ | ✅ | ✅ domain 316 | — |
| P3 | `1ee8371` | `projects.test.ts`: mock `tx`, activity `project_created`, rollback / P2002 | ✅ | ✅ | ✅ 638 | — |
| P5 | `876a4b8` | mới `activities.test.ts` (5) | ✅ | ✅ | ✅ | — |
| P6 | `cd58509` | mới `api/activities/route.test.ts` (16) | ✅ | ✅ | ✅ | — |
| P4 | `bf362b8` | `tasks.test.ts`: mock `tx`, 15 test activity (tạo, tạo DONE, →DONE, không ghi, P2003, count 0, reject) | ✅ | ✅ | ✅ 674 | ✅ |

P2 ∥ P3 và P4 ∥ P5 ∥ P6 chạy song song (khác file). Sau P4 chạy đủ 4 lệnh trên toàn repo: 26 file, 674 test, build xanh.

## 4. Review code

Reviewer đã chạy: `layer-reviewer`, `typescript-reviewer`, `security-reviewer` trên `git diff develop...HEAD` @ `23e9380`. Không có CRITICAL / HIGH.

| # | Mức | File:dòng | Vấn đề | Reviewer |
|---|---|---|---|---|
| R1 | MEDIUM | `src/server/tasks.ts` `updateTask` | `current.status` đọc ngoài transaction: hai PATCH `DONE` đồng thời có thể ghi 2 `task_done` (quyết định 8 đã chấp nhận) | typescript, layer (LOW) |
| R2 | MEDIUM | `src/server/tasks.ts` `activityRows`, `src/server/projects.ts` `createProject` | Dựng dòng activity lặp ở hai file (một bên helper, một bên literal) | typescript |
| R3 | MEDIUM | `src/domain/activity-record.ts` `messageFromMeta` | `meta.message` không giới hạn độ dài khi trả client; hiện chỉ server ghi hằng, rủi ro khi sau này ghi câu từ input | security |
| R4 | MEDIUM | `src/app/api/activities/route.ts` | Chưa có rate limit (chung cho mọi route) | security |
| R5 | LOW | `src/app/api/activities/route.ts` | `duplicateQueryKeyMessage` chép từ `tasks/route.ts` | Claude (từ báo cáo P6) |
| R6 | LOW | `src/server/projects.test.ts` | Test "`activity.createMany` ném P2002 → conflict" mô tả tình huống không xảy ra (Activity không có unique), tên gây hiểu nhầm | typescript |
| R7 | LOW | `src/server/tasks.ts` catch P2003 | P2003 từ `activity.createMany` (user bị xoá giữa chừng) bị map thành `invalid_project` / `invalid_space` | typescript |
| R8 | LOW | `src/server/projects.ts`, `tasks.ts` | `createdAt` của activity = `now` (JS), của task / dự án = DB default, lệch nhỏ | typescript |
| R9 | LOW | mock `$transaction` | Không kiểm được rollback thật | typescript |
| R10 | LOW | `validation.ts`, `activity-record.ts`, `labels.ts`, `activities.ts` | Gợi ý gọn schema `limit`, bỏ phụ thuộc zod trong type guard, `ACTIVITY_TYPES` duy trì tay, sort thêm theo `id` | typescript, layer, security |

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
