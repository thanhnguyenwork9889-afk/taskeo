# T004 · API + UI CRUD Không gian (tên, màu, icon)

| | |
|---|---|
| Nhánh | `feat/T004-spaces-api` |
| Tạo từ | `develop` @ `98e1bf7` |
| Trạng thái | 4-review |
| Ngày tạo | 2026-11-25 |

Nguồn: sheet nhiệm vụ, dòng **T20** (backlog B2, phần `spaces`).

## 1. Docs – yêu cầu

**Mục tiêu:** Không gian có đủ tạo / xem / sửa / xoá, kể cả màu và icon: phía server có API route dùng Prisma + Zod; phía giao diện (vẫn chạy trên store demo) có sửa và xoá không gian.

**Hiện trạng:** Giao diện chỉ *tạo* được không gian (`create-dialog.tsx` → `createSpace`), màu tự gán theo `SPACE_PALETTE`, không có icon, không sửa hay xoá được. Bảng `Space` trong Prisma đã có `name`, `description`, `color`, `icon`, `order` nên **không cần migration**. Chưa có API route nào ngoài `/api/auth`.

**Phạm vi:**
- `domain/`: schema Zod cho input tạo / sửa không gian (tên 1–200 ký tự, mô tả ≤ 500, `color` thuộc `SPACE_PALETTE`, `icon` thuộc danh sách `SPACE_ICONS` mới); thêm `icon` vào kiểu `Space` phía client (dữ liệu localStorage cũ thiếu `icon` vẫn đọc được, mặc định `"folder"`); hàm thuần `updateSpace`, `deleteSpace` (xoá luôn dự án, công việc, tài liệu của không gian — khớp `onDelete: Cascade` trong schema); hàm đổi bản ghi DB → `Space` client (tính `tint` từ `color`).
- `server/spaces.ts`: `listSpaces`, `getSpace`, `createSpace`, `updateSpace`, `deleteSpace`, luôn lọc theo `userId`.
- API route: `GET/POST /api/spaces`, `GET/PATCH/DELETE /api/spaces/[id]`. Mỗi route gọi `auth()`; chưa đăng nhập → 401; chế độ demo / misconfigured → 503 (demo không có DB); input sai → 400 kèm lỗi Zod; id không tồn tại hoặc của người khác → 404; `DELETE` → 204. Phản hồi theo một dạng chung `{ data, error }`.
- UI (store demo): hộp thoại tạo không gian có chọn màu + icon; nút **Sửa** ở trang chi tiết không gian (tên, mô tả, màu, icon); nút **Xoá** có hộp xác nhận nêu số dự án / công việc / tài liệu sẽ mất, xoá xong về `/spaces`; icon đã chọn hiện ở danh sách không gian, sidebar, thẻ Không gian ở Tổng quan và trang chi tiết.

**Ngoài phạm vi:**
- Nối giao diện vào API (thay store demo bằng TanStack Query) — sheet T59 / backlog B3.
- API dự án và công việc (T21, T22), ghi `Activity` (T27), thư mục Drive cho không gian (T31).
- Sắp xếp lại thứ tự không gian (`order`) bằng kéo thả.
- Rate limit (T73), test e2e (T61).

**Tiêu chí nghiệm thu** (mỗi dòng kiểm tra được):
- [ ] `GET /api/spaces` khi chưa đăng nhập trả 401; ở chế độ demo trả 503.
- [ ] `POST /api/spaces` với tên rỗng, màu ngoài bảng màu hoặc icon lạ trả 400; hợp lệ trả 201 kèm không gian mới (có `id`, `color`, `icon`, `tint`).
- [ ] `GET/PATCH/DELETE /api/spaces/[id]` với id của người dùng khác trả 404 và không đổi dữ liệu (test kiểm tra mọi truy vấn Prisma có `userId`).
- [ ] `PATCH` chỉ đổi các trường gửi lên; `DELETE` trả 204.
- [ ] Ở chế độ demo: tạo không gian chọn được màu + icon; sửa tên / mô tả / màu / icon ở trang chi tiết và thấy thay đổi ở danh sách, sidebar, Tổng quan; xoá có xác nhận, sau khi xoá dự án / công việc / tài liệu của không gian cũng biến mất.
- [ ] localStorage đang có dữ liệu cũ (không có `icon`) vẫn mở được, không bị đưa về dữ liệu mẫu.
- [ ] Có unit test cho schema, `updateSpace`, `deleteSpace`, hàm đổi bản ghi; có test cho route handler (mock `auth` + Prisma) phủ 401 / 400 / 404 / thành công.
- [ ] typecheck, lint, test, build xanh.

**Tài liệu bị ảnh hưởng:** 04 kiến trúc (thêm `server/spaces.ts`, `app/api/spaces`), 06 API (bảng route mới).

## 2. Kế hoạch từng phần

Phát hiện khi lập kế hoạch (đã kiểm tra lại trong code):
- Session của Auth.js chưa có `user.id` (`auth.ts` không có `callbacks.session`) → phải thêm, nếu không thì không lọc được theo `userId` (P4).
- `next.config.ts` bật `cacheComponents` → mọi handler GET gọi `await connection()` ở dòng đầu để không bị prerender thành phản hồi tĩnh lúc build; không bọc nó trong try/catch.
- Next 16: `params` của route động là `Promise`; DELETE trả `new Response(null, { status: 204 })`.
- Route chỉ `import()` động `@/server/spaces` sau khi đã qua kiểm tra chế độ + phiên, để chế độ demo không khởi tạo Prisma.

| Phần | Việc | File | Agent | Test cần viết (trước) | Phụ thuộc |
|---|---|---|---|---|---|
| P1 | `SPACE_ICONS` (id chuỗi, mặc định `folder`) + nhãn; `Space.icon`; `tintForColor`; `spaceSchema` storage có `icon` `.catch("folder")`; `createSpaceInputSchema` / `updateSpaceInputSchema` (`.strict()`, không `.default()`, PATCH ≥ 1 trường); seed thêm `icon` | `src/domain/types.ts` `labels.ts` `validation.ts` `seed.ts`, mới `validation.test.ts` | feature-builder | state cũ thiếu `icon` vẫn parse; input sai (tên rỗng/201 ký tự, mô tả 501, màu lạ, icon lạ, key thừa) bị từ chối; PATCH `{}` bị từ chối, `{name}` không sinh `color`/`icon` | — |
| P2 | `createSpace(state, input)` nhận màu/icon; `updateSpace` (tính lại `tint`); `deleteSpace` (cascade dự án, công việc, file, gỡ `linkedFileIds`); `spaceDeletionImpact`; sửa 1 dòng gọi trong create-dialog | `src/domain/workspace-actions.ts` + test, `create-dialog.tsx` (1 dòng) | feature-builder | không mutate; update chỉ đổi trường gửi; delete cascade đúng, không đụng không gian khác; impact đếm đúng | P1 |
| P3 | `spaceFromRecord`: bản ghi DB → `Space` client (null/lạ → mặc định, tính `tint`), không import `@prisma/client` | mới `src/domain/space-record.ts` + test | feature-builder | đủ trường, nhánh null/lạ, kết quả qua `spaceSchema` | P1 |
| P4 | `callbacks.session` gắn `user.id` + augment kiểu; `getApiUserId()` → `{ok,userId}` / 401 / 503 (demo, misconfigured không import auth); alias `server-only` → stub trong `vitest.config.ts` | `src/server/auth/auth.ts` `session.ts`, mới `session.test.ts`, `vitest.config.ts` | google-integrator | demo/misconfigured → 503 và không gọi `auth`; không phiên → 401; có id → ok | — |
| P5 | `listSpaces` / `getSpace` / `createSpace` / `updateSpace` (`updateMany` theo `{id,userId}`) / `deleteSpace` (`deleteMany`) | mới `src/server/spaces.ts` + test | api-builder | mọi lời gọi Prisma có `userId`; id người khác → null/false; update chỉ truyền trường có mặt | P1, P3 |
| P6 | Helper phản hồi `{data, error}` (400 Zod / JSON hỏng, 500 không lộ chi tiết); `GET/POST /api/spaces` | mới `src/server/http.ts`, `src/app/api/spaces/route.ts` + test | api-builder | 401, 503, 400 (tên rỗng, màu lạ, icon lạ, JSON hỏng), 201 có `id,color,icon,tint`, GET 200 | P4, P5 |
| P7 | `GET/PATCH/DELETE /api/spaces/[id]` | mới `src/app/api/spaces/[id]/route.ts` + test | api-builder | 401/503; 404 id không có / của người khác; 400 PATCH `{}` hoặc key thừa; PATCH 200; DELETE 204 body rỗng | P6 |
| P8 | `SpaceIcon` (id → icon lucide) + `SpaceStylePicker` (radio màu + icon, có nhãn, dùng được bàn phím) | mới `src/components/ui/space-icon.tsx` `space-style-picker.tsx` | feature-builder | (không có test component) kiểm tay | P1 |
| P5 | `155229e` | `spaces.test.ts` (10) | ✅ | ✅ | ✅ 150/150 | ✅ |
| P9 | `eff97fe` | — (kiểm tay) | ✅ | ✅ | ✅ 150/150 | ✅ |
| P10 | `0a930a6` | — (kiểm tay) | ✅ | ✅ | ✅ 150/150 | ✅ |
| P11 | `12120f3` | — (kiểm tay) | ✅ | ✅ | ✅ 150/150 | ✅ |
| P6 | `b9e7b65` | `http.test.ts` (9), `route.test.ts` (16) | ✅ | ✅ | ✅ 150/150 | ✅ |
| P7 | `d3ff7a7` | `[id]/route.test.ts` (26) | ✅ | ✅ | ✅ 176/176 | ✅ |
| P9 | Hộp thoại tạo không gian: ô mô tả + chọn màu/icon | `src/components/layout/create-dialog.tsx` | feature-builder | kiểm tay chế độ demo | P2, P8 |
| P10 | Trang chi tiết: icon ở header, nút Sửa (`space-edit-dialog`), nút Xoá có xác nhận số lượng (`space-delete-dialog`), xoá xong về `/spaces` không nháy trang 404 | `src/features/spaces/space-detail.tsx`, mới `space-edit-dialog.tsx` `space-delete-dialog.tsx` | feature-builder | kiểm tay | P2, P8 |
| P11 | Hiện icon ở danh sách không gian, thẻ Không gian ở Tổng quan, sidebar | `spaces-list.tsx`, `dashboard/spaces-card.tsx`, `layout/sidebar.tsx` | feature-builder | kiểm tay | P8 |

Thứ tự (cùng đợt = khác file, chạy song song): đợt 1 P1 + P4 → đợt 2 P2 + P3 + P8 → đợt 3 P5 + P9 + P10 + P11 → P6 → P7. Docs 04 / 06 cập nhật ở bước 7.

Rủi ro / phụ thuộc:
- localStorage cũ thiếu `icon`: dùng `z.enum` thường sẽ đẩy người dùng về dữ liệu mẫu → bắt buộc `.catch("folder")`.
- Mass assignment: schema input `.strict()`, không nhận `userId`, `id`, `driveFolderId`, `order`.
- Activity trỏ tới công việc đã xoá: thẻ Hoạt động phải chịu được `entityId` không còn tồn tại.
- Giao diện (P8–P11) chưa có hạ tầng test component → chỉ kiểm tay ở chế độ demo; logic dồn vào `domain/` để có unit test.
- Chưa có rate limit (T73) — ghi chú trong docs 06.

Duyệt kế hoạch: ☐ chờ · ☒ người dùng đã duyệt (2026-11-25) · ☐ bỏ qua (`--yes`)

## 3. Thực hiện + kiểm thử

| Phần | Commit | Test thêm | typecheck | lint | test | build |
|---|---|---|---|---|---|---|
| P1 | `497e820` | `validation.test.ts` (22) | ✅ | ✅ | ✅ 88/88 | ✅ |
| P4 | `72adafa` | `session.test.ts` (7) | ✅ | ✅ | ✅ 88/88 | ✅ |
| P2 | `689637c` | `workspace-actions.test.ts` (+16) | ✅ | ✅ | ✅ 115/115 | ✅ |
| P3 | `ea25cbc` | `space-record.test.ts` (8) | ✅ | ✅ | ✅ 115/115 | ✅ |
| P8 | `cc8afc0` | `space-icons.test.ts` (3) | ✅ | ✅ | ✅ 115/115 | ✅ |

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
