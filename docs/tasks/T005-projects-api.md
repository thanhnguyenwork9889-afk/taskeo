# T005 · API + UI CRUD Dự án trong Không gian

| | |
|---|---|
| Nhánh | `feat/T005-projects-api` |
| Tạo từ | `develop` @ `0784c30` |
| Trạng thái | 3-build |
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

Duyệt kế hoạch: ☒ chờ · ☐ người dùng đã duyệt (ngày) · ☐ bỏ qua (`--yes`)

## 3. Thực hiện + kiểm thử

| Phần | Commit | Test thêm | typecheck | lint | test | build |
|---|---|---|---|---|---|---|
| P1 | | | | | | |

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
