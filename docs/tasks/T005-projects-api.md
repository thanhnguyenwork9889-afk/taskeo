# T005 · API + UI CRUD Dự án trong Không gian

| | |
|---|---|
| Nhánh | `feat/T005-projects-api` |
| Tạo từ | `develop` @ `0784c30` |
| Trạng thái | 7-final |
| Ngày tạo | 2026-11-25 |

Nguồn: sheet nhiệm vụ, dòng **T21** (backlog B2, phần `projects`). Theo cùng mẫu với T004 (không gian).

## 1. Docs – yêu cầu

**Mục tiêu:** Dự án trong một không gian có đủ tạo / xem / sửa / xoá: phía server có API route dùng Prisma + Zod (theo mẫu `spaces` của T004); phía giao diện (vẫn chạy trên store demo) sửa được tên / mô tả và xoá được dự án.

**Hiện trạng:**
- Giao diện *tạo* được dự án chỉ với tên (`create-dialog.tsx` → `createProject`, mô tả cố định, chặn trùng tên trong không gian bằng `projectNameExists`); trang chi tiết đổi được `status` và `dueDate` (`updateProject`). Không sửa được tên / mô tả, không xoá được.
- Bảng `Project` trong Prisma đã có `name`, `description`, `status`, `dueDate`, `order`, `@@unique([spaceId, name])`; `Task.projectId` có `onDelete: SetNull` → **không cần migration**.
- Đã có sẵn từ T004: `getApiUserId()`, `server/http.ts` (`{ data, error }`, 400/500), mẫu route với `await connection()` + `import()` động.

**Phạm vi:**
- `domain/`: schema Zod `createProjectInputSchema` (tên 1–200, mô tả ≤ 500, `status` thuộc `PROJECT_STATUSES`, `dueDate` ISO `YYYY-MM-DD` hoặc `null`) và `updateProjectInputSchema` (`.strict()`, ≥ 1 trường, không nhận `spaceId`, `userId`, `id`, `order`, `driveFolderId`); hàm thuần `updateProject` mở rộng thêm `name` (chặn trùng tên trong cùng không gian), `deleteProject` + `projectDeletionImpact`; hàm đổi bản ghi DB → `Project` client (`dueDate` → `YYYY-MM-DD`, mô tả `null` → `""`).
- `server/projects.ts`: `listProjects(userId, spaceId)`, `getProject`, `createProject` (kiểm không gian thuộc người dùng), `updateProject`, `deleteProject`; mọi truy vấn lọc theo `userId`.
- API route:
  - `GET /api/spaces/[id]/projects` — danh sách dự án của không gian; `POST /api/spaces/[id]/projects` — tạo dự án trong không gian.
  - `GET/PATCH/DELETE /api/projects/[id]`.
  - Mã lỗi theo quy ước T004: 401 chưa đăng nhập; 503 chế độ demo / misconfigured; 400 input sai hoặc JSON hỏng; 404 không gian / dự án không có hoặc của người khác; **409** trùng tên trong cùng không gian (khi tạo và khi đổi tên) hoặc vượt giới hạn số dự án mỗi không gian; `DELETE` → 204.
- Xoá dự án: công việc của dự án **giữ lại** trong không gian, `projectId` → `null` (khớp `onDelete: SetNull`); tài liệu của dự án cũng giữ lại, `projectId` → `null`. Store demo làm y như vậy.
- UI (store demo): trang chi tiết dự án có nút **Sửa** (tên, mô tả; báo lỗi khi tên trống hoặc trùng) và nút **Xoá** có hộp xác nhận nêu số công việc / tài liệu sẽ chuyển về không gian; xoá xong về trang không gian, không nháy 404.

**Ngoài phạm vi:**
- Chuyển dự án sang không gian khác (`spaceId` không sửa được).
- Nối giao diện vào API (TanStack Query) — sheet T59 / backlog B3.
- API công việc (T22), ghi `Activity` (T27), thư mục Drive cho dự án (T31).
- Sắp xếp `order` bằng kéo thả; rate limit (T73); test e2e (T61).

**Tiêu chí nghiệm thu** (mỗi dòng kiểm tra được):
- [ ] `GET /api/spaces/[id]/projects` khi chưa đăng nhập trả 401; ở chế độ demo trả 503; không gian của người khác trả 404.
- [ ] `POST /api/spaces/[id]/projects` với tên rỗng, `status` lạ, `dueDate` sai định dạng hoặc key thừa (`spaceId`, `userId`) trả 400; tên trùng trong cùng không gian trả 409; hợp lệ trả 201 kèm dự án mới (`id`, `spaceId`, `name`, `description`, `status`, `dueDate`).
- [ ] `GET/PATCH/DELETE /api/projects/[id]` với id của người khác trả 404 và không đổi dữ liệu (test kiểm tra mọi truy vấn Prisma có `userId`).
- [ ] `PATCH` chỉ đổi các trường gửi lên; `PATCH {}` trả 400; đổi tên trùng trả 409; `DELETE` trả 204 và công việc của dự án vẫn còn với `projectId = null`.
- [ ] Ở chế độ demo: sửa tên / mô tả dự án ở trang chi tiết và thấy thay đổi ở trang chi tiết, thẻ dự án trong không gian; tên trùng bị báo lỗi; xoá có xác nhận, về trang không gian, công việc và tài liệu của dự án vẫn hiện trong không gian.
- [ ] Có unit test cho schema, `updateProject`, `deleteProject`, `projectDeletionImpact`, hàm đổi bản ghi, `server/projects.ts`; có test cho route handler (mock `auth` + Prisma) phủ 401 / 503 / 400 / 404 / 409 / thành công.
- [ ] typecheck, lint, test, build xanh.

**Tài liệu bị ảnh hưởng:** 04 kiến trúc (thêm `server/projects.ts`, `app/api/projects`, `app/api/spaces/[id]/projects`), 06 API (bảng route mới).

## 2. Kế hoạch từng phần

Phát hiện khi lập kế hoạch:
- Bẫy của T004 vẫn áp dụng: `await connection()` dòng đầu mọi GET (không bọc try/catch); `params` là `Promise`; chỉ `import()` động `@/server/projects` sau khi `getApiUserId()` ok; schema `z.strictObject`, không `.default()`, PATCH `.refine` ≥ 1 trường; DELETE trả `new Response(null, { status: 204 })`; mô tả rỗng → `null`, đọc ra `null` → `""`.
- **Trùng tên:** `@@unique([spaceId, name])` trên Postgres phân biệt hoa thường, còn demo (`projectNameExists`) thì không. Server kiểm trước bằng `findFirst` với `mode: "insensitive"` (bỏ chính nó khi đổi tên), vẫn bắt thêm lỗi `P2002` (kiểm `error.code`, không import lớp lỗi của Prisma) cho trường hợp đồng thời → 409; lỗi khác ném tiếp → 500.
- **`dueDate`:** không dùng `toISODate` / `parseISODate` (theo giờ máy) trên server. Ghi `new Date(\`${d}T00:00:00.000Z\`)`, đọc `toISOString().slice(0, 10)`. Schema input kiểm thêm ngày có thật (chặn `2026-02-31`); giữ nguyên `projectSchema` của localStorage.
- **Giới hạn:** `MAX_PROJECTS_PER_SPACE = 200`; `createProject` đếm theo `{ userId, spaceId }` → `limit` → 409; `listProjects` `take` đúng hằng này. Đếm rồi tạo không atomic — chấp nhận như R14 của T004.
- **Không gian thuộc người dùng:** `listProjects` / `createProject` kiểm `space.findFirst({ id, userId })` trước → 404 "Không tìm thấy không gian".
- Route lồng phải nằm ở `src/app/api/spaces/[id]/projects/` (thư mục động bắt buộc tên `[id]`), nên `params.id` ở đó là id không gian.
- `isValidId` đang khai báo riêng trong `spaces/[id]/route.ts` → chuyển thành `isValidRouteId` trong `server/http.ts` ở P4 để P5, P6 dùng chung.
- Prisma không có model tài liệu → giữ tài liệu khi xoá dự án chỉ có ý nghĩa ở store demo. "Công việc còn lại với `projectId = null`" dựa vào `onDelete: SetNull`, kiểm thật trên DB nhánh `dev` ở bước 7.
- UI xoá: làm như `SpaceDeleteDialog` (`onDeleting` bật cờ → `router.replace` → `updateWorkspace`) để không nháy 404.

| Phần | Việc | File | Agent | Test cần viết (trước) | Phụ thuộc |
|---|---|---|---|---|---|
| P1 | `PROJECT_NAME_MAX` / `PROJECT_DESCRIPTION_MAX`; `projectDueDateSchema` (`YYYY-MM-DD` có thật hoặc `null`); `createProjectInputSchema` (`name`, `description?`, `status?`, `dueDate?`), `updateProjectInputSchema` (strict, ≥ 1 trường); kiểu `CreateProjectInput` / `UpdateProjectInput` | `src/domain/validation.ts` + test | feature-builder | từ chối tên rỗng / 201 ký tự, mô tả 501, `status` lạ, `dueDate` sai / `2026-02-31`, key thừa (`spaceId`, `userId`, `id`, `order`, `driveFolderId`); PATCH `{}` bị từ chối; `{name}` không sinh trường khác; `dueDate: null` hợp lệ | — |
| P2 | `projectNameExists(..., excludeId?)`; `updateProject` thêm `name` (trim, rỗng bỏ qua, trùng → state cũ); `deleteProject` (công việc, tài liệu: `projectId` → `null`, giữ `spaceId`); `projectDeletionImpact` `{ tasks, files }` | `src/domain/workspace-actions.ts` + test | feature-builder | không mutate; đổi tên trùng (khác hoa thường) với dự án khác → tham chiếu cũ, trùng chính mình thì được; xoá giữ công việc / tài liệu đúng `spaceId`, không đụng dự án khác; id lạ không đổi gì; impact đếm đúng | — |
| P3 | `ProjectRecord` + `projectFromRecord` (mô tả `null` → `""`, `status` lạ → `ACTIVE`, bỏ trường thừa); `dueDateToDb` / `dueDateFromDb` theo UTC; không import `@prisma/client` | mới `src/domain/project-record.ts` + test | feature-builder | ổn định khi đổi `TZ` (Asia/Ho_Chi_Minh, America/Los_Angeles); `null` hai chiều; kết quả qua `projectSchema` | — |
| P4 | `listProjects` (null nếu không gian lạ), `getProject`, `createProject` (không gian, giới hạn, trùng tên, P2002), `updateProject` (chỉ trường có mặt, conflict), `deleteProject` (`deleteMany`); `MAX_PROJECTS_PER_SPACE`; `isValidRouteId` trong http.ts (route không gian dùng lại) | mới `src/server/projects.ts` + test; `src/server/http.ts` + test; `src/app/api/spaces/[id]/route.ts` (đổi sang hàm chung) | api-builder | mọi lời gọi Prisma có `userId`; của người khác → `not_found`; trùng (kiểm trước và P2002) → `conflict`, lỗi khác ném tiếp; đủ giới hạn → `limit`; `take` đúng hằng; không gửi `undefined` | P1, P3 |
| P5 | `GET/POST /api/spaces/[id]/projects` | mới `src/app/api/spaces/[id]/projects/route.ts` + test | api-builder | GET gọi `connection()`; 401; 503 không import server; 404 không gian lạ / id quá dài; 400 (tên rỗng, status lạ, dueDate sai, key thừa, JSON hỏng); 409 trùng / giới hạn; 201 đủ trường; GET 200; 500 không lộ chi tiết | P4 |
| P6 | `GET/PATCH/DELETE /api/projects/[id]` | mới `src/app/api/projects/[id]/route.ts` + test | api-builder | 401 / 503; 404 id lạ / của người khác / quá dài; 400 PATCH `{}`, key thừa `spaceId`, JSON hỏng; 409 đổi tên trùng; PATCH 200 chỉ trường đã gửi; DELETE 204 body rỗng; 500 | P4 |
| P7 | `ProjectEditDialog` (tên, mô tả, `maxLength`, lỗi tên trống / trùng); `ProjectDeleteDialog` (số công việc / tài liệu chuyển về không gian, `onDeleting`, về `/spaces/[spaceId]`); nút Sửa / Xoá ở header `project-detail`, cờ `deleting` | mới `src/features/projects/project-edit-dialog.tsx` `project-delete-dialog.tsx`; `project-detail.tsx` | feature-builder | kiểm tay chế độ demo | P1, P2 |

Thứ tự (cùng đợt = khác file, chạy song song): đợt 1 P1 + P2 + P3 → đợt 2 P4 + P7 → đợt 3 P5 + P6. Docs 04 / 06 cập nhật ở bước 7.

Rủi ro / phụ thuộc:
- Trùng tên lệch giữa DB (phân biệt hoa thường) và demo → bắt buộc kiểm trước với `mode: "insensitive"`.
- Lệch ngày do múi giờ nếu dùng hàm ngày theo giờ máy trên server → P3 có test đổi `TZ`.
- Mass assignment: `.strict()` chặn `spaceId`, `userId`, `id`, `order`, `driveFolderId`.
- `updateProject` (domain) thêm `name` phải giữ tương thích với chỗ đang dùng cho `status` / `dueDate`.
- UI chưa có test component → chỉ kiểm tay; logic dồn vào `domain/`.
- Chưa có rate limit / giới hạn body (T73).

Duyệt kế hoạch: ☐ chờ · ☒ người dùng đã duyệt (2026-11-25) · ☐ bỏ qua (`--yes`)

## 3. Thực hiện + kiểm thử

| Phần | Commit | Test thêm | typecheck | lint | test | build |
|---|---|---|---|---|---|---|
| P1 | `25ef97d` | `validation.test.ts` (+42) | ✅ | ✅ | ✅ 264/264 | ✅ |
| P2 | `a62fd70` | `workspace-actions.test.ts` (+16) | ✅ | ✅ | ✅ 264/264 | ✅ |
| P3 | `8e0623d` | `project-record.test.ts` (13) | ✅ | ✅ | ✅ 264/264 | ✅ |
| P4 | `b5e492b` | `projects.test.ts` (24), `http.test.ts` (+`isValidRouteId`) | ✅ | ✅ | ✅ 290/290 | ✅ |
| P7 | `9435c81` | — (kiểm tay ở bước 7) | ✅ | ✅ | ✅ 290/290 | ✅ |
| P5 | `247ccb1` | `spaces/[id]/projects/route.test.ts` (24) | ✅ | ✅ | ✅ 343/343 | ✅ |
| P6 | `bac6b89` | `projects/[id]/route.test.ts` (29) | ✅ | ✅ | ✅ 343/343 | ✅ |

## 4. Review code

Reviewer đã chạy: `layer-reviewer`, `typescript-reviewer`, `security-reviewer` trên `git diff develop...HEAD` @ `d2bfbf8`. Reviewer không báo CRITICAL / HIGH; R1 được nâng lên HIGH sau khi kiểm lại (xem dưới).

| # | Mức | File:dòng | Vấn đề | Reviewer |
|---|---|---|---|---|
| R1 | HIGH | `src/server/projects.ts` (`nameTaken`) | `equals` + `mode: "insensitive"` được Prisma dịch thành `"name" ILIKE $3` **không thoát** ký tự → `_` và `%` trong tên là ký tự đại diện: `Q1_plan` trùng nhầm `Q1xplan`, tên `%` trùng mọi dự án → 409 sai, không tạo / đổi tên được. Đã kiểm bằng log SQL của Prisma trên DB `dev` (chỉ đọc) | typescript (MEDIUM, nghi ngờ) → xác nhận |
| R2 | MEDIUM | `src/domain/validation.ts` (`projectDueDateSchema`) | Nhận `0000-01-01` (JS hợp lệ, Postgres không có năm 0) → Prisma ném lỗi → 500 thay vì 400 | typescript |
| R3 | MEDIUM | `docs/04`, `docs/06` | Chưa cập nhật kiến trúc và bảng route | layer, typescript → bước 7 |
| R4 | MEDIUM | `src/server/projects.ts` (`updateProject`, `createProject`) | Kiểm trùng rồi ghi không atomic; hai request đồng thời khác hoa thường (`A` / `a`) đều qua, unique của DB chỉ chặn trùng chính xác | security, typescript |
| R5 | LOW | `src/domain/workspace-actions.ts` (`updateProject`) | `{ ...current, ...changes }` ghi đè thành `undefined` nếu `changes` có khoá giá trị `undefined` | layer, typescript |
| R6 | LOW | `src/server/projects.ts` (`createProject`, `order: count`) | Sau khi xoá dự án, `count` trùng `order` đang có | layer, typescript |
| R7 | LOW | `nameTaken` / `projectNameExists` | So hoa thường của Postgres và `toLocaleLowerCase("vi")` có thể lệch với vài ký tự Unicode đặc biệt | layer, typescript |
| R8 | LOW | `src/server/projects.ts` (`createProject`) | `limit` xét trước `conflict` (cùng 409) | typescript |
| R9 | LOW | `project-detail.tsx`, `project-delete-dialog.tsx` | Cờ `deleting` không reset nếu `router.replace` lỗi; focus về `body` sau khi xoá | typescript |
| R10 | LOW | `project-edit-dialog.tsx` | Sau submit lỗi không chuyển focus vào ô lỗi; gõ một ô xoá lỗi mọi ô; bộ đếm không `aria-live` | typescript |
| R11 | LOW | `src/app/api/**` | Chưa có rate limit, giới hạn body, kiểm `Origin` | security |
| R12 | LOW | `project-*-dialog.tsx` | Chuỗi UI viết cứng trong component (giống dialog không gian T004) | layer |
| R13 | LOW | `src/server/projects.ts` (`listProjects`) | `take: 200` không phân trang | security |

## 5. Fix bug

| Phát hiện | Xử lý | Commit |
|---|---|---|
Commit trước bước 5: `c41352b`.

| Phát hiện | Xử lý | Commit |
|---|---|---|
| R1 | đã sửa: `escapeLikePattern` thoát `\` → `%` → `_` trước khi đưa vào `equals` + `insensitive`; tên ghi DB vẫn là tên gốc. Kiểm thật trên Postgres (`SELECT … ILIKE …`, chỉ đọc): `Q1xplan`/`Q1_plan` và `anything`/`%` hết khớp nhầm; `q1_PLAN`/`Q1_plan`, `Dự Án`/`dự án` vẫn khớp; `a\b` giờ khớp đúng (bản cũ không khớp) | `b8dbd48` |
| R2 | đã sửa: `projectDueDateSchema` chỉ nhận năm 1900–2100 (`PROJECT_DUE_YEAR_MIN/MAX`) | `b8dbd48` |
| R5 | đã sửa: `updateProject` (domain) bỏ khoá `undefined` trước khi gộp; `ProjectEditDialog` gửi thẳng `result.data` | `b8dbd48` |
| R6 | đã sửa: `order` = `max(order) + 1` (`aggregate` có `userId`), 0 khi chưa có dự án | `b8dbd48` |
| R3 | làm ở bước 7 | — |
| R4 | chấp nhận, ghi việc để sau: cần unique index trên `lower(name)` (migration riêng) mới chặn được đồng thời | — |
| R7 | chấp nhận: lệch hoa thường chỉ với vài ký tự Unicode đặc biệt; tiếng Việt đã kiểm khớp | — |
| R8 | bỏ qua: đúng spec, ghi vào docs 06 | — |
| R9, R10 | để sau: cải thiện focus / a11y cho cả dialog không gian và dự án cùng lúc | — |
| R11 | để sau: T73 | — |
| R12, R13 | bỏ qua: nhất quán với T004; có giới hạn trên 200 | — |

Kết quả 4 lệnh sau khi sửa: typecheck ✅ · lint ✅ · test ✅ 361/361 · build ✅.

## 6. Review lại

Vòng 1 (`git diff c41352b..b8dbd48`, cả ba reviewer): R1, R2, R5, R6 sửa đúng, có test. Không có CRITICAL / HIGH mới → sang bước 7.
- MEDIUM (typescript) / LOW (layer): `Object.fromEntries` trong `updateProject` (domain) làm mất kiểu khoá, khoá lạ (`id`, `spaceId`) vẫn lọt qua lúc chạy → đã sửa ngay: chọn rõ từng trường (`46643d1`), 151/151 test domain, typecheck xanh.
- LOW, để sau: gộp `count` + `aggregate` để bớt một truy vấn; thông báo "Ngày không hợp lệ" chưa nêu khoảng năm cho phép; `projectSchema` (localStorage) không giới hạn năm (cố ý: không đẩy dữ liệu cũ về mẫu); nên có test tích hợp với DB thật cho `escapeLikePattern` phòng khi nâng Prisma đổi cách thoát.

## 7. Final

**Tóm tắt:**

**Tiêu chí nghiệm thu:** (đánh dấu ở mục 1)

**Tài liệu đã cập nhật:**

**Merge vào develop:** commit `<hash>`, ngày

**Việc để sau:**
-
