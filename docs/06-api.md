# 06 · API

## Hiện có

| Route | File | Việc |
|---|---|---|
| `/api/auth/*` | `src/app/api/auth/[...nextauth]/route.ts` | Auth.js (đăng nhập Google, callback, session) |
| Server action `signInWithGoogle`, `signOutAction` | `src/server/auth/actions.ts` | Đăng nhập / đăng xuất từ giao diện |
| `GET /api/spaces` | `src/app/api/spaces/route.ts` | Danh sách không gian của người dùng (tối đa 200) |
| `POST /api/spaces` | `src/app/api/spaces/route.ts` | Tạo không gian. Body `{ name, description?, color?, icon? }` → 201; 409 khi đã có 200 không gian |
| `GET /api/spaces/[id]` | `src/app/api/spaces/[id]/route.ts` | Một không gian → 200 / 404 |
| `PATCH /api/spaces/[id]` | `src/app/api/spaces/[id]/route.ts` | Sửa các trường gửi lên (≥ 1 trường) → 200 / 404 |
| `DELETE /api/spaces/[id]` | `src/app/api/spaces/[id]/route.ts` | Xoá không gian, kéo theo dự án và công việc (cascade) → 204 / 404 |
| `GET /api/spaces/[id]/projects` | `src/app/api/spaces/[id]/projects/route.ts` | Dự án của không gian (tối đa 200) → 200 / 404 không gian lạ |
| `POST /api/spaces/[id]/projects` | `src/app/api/spaces/[id]/projects/route.ts` | Tạo dự án. Body `{ name, description?, status?, dueDate? }` → 201; 404 không gian lạ; 409 trùng tên trong không gian hoặc đã có 200 dự án (giới hạn xét trước trùng tên) |
| `GET /api/projects/[id]` | `src/app/api/projects/[id]/route.ts` | Một dự án → 200 / 404 |
| `PATCH /api/projects/[id]` | `src/app/api/projects/[id]/route.ts` | Sửa các trường gửi lên (≥ 1 trường) → 200 / 404 / 409 đổi tên trùng. Không đổi được `spaceId` |
| `DELETE /api/projects/[id]` | `src/app/api/projects/[id]/route.ts` | Xoá dự án; công việc giữ lại trong không gian với `projectId = null` (`onDelete: SetNull`) → 204 / 404 |

### Quy ước chung (từ T004)

- Phản hồi: `{ data, error }`. Lỗi: `{ data: null, error: { message, details? } }`, `details` là `z.flattenError` khi input sai.
- Mã lỗi: 400 JSON hỏng hoặc input sai (schema `.strict()`, không nhận `userId`, `id`, `order`, `driveFolderId`) · 401 chưa đăng nhập · 404 không có, của người khác hoặc id sai định dạng (không phân biệt) · 503 chế độ demo / thiếu cấu hình (không có DB) · 500 thông báo chung, chỉ log `name`, `message`, `stack`.
- `color` phải thuộc `SPACE_PALETTE`, `icon` thuộc `SPACE_ICONS` (`src/domain/labels.ts`); bỏ trống thì server chọn mặc định. Mô tả rỗng lưu `null`.
- Dự án (T005): `status` thuộc `ACTIVE | ON_HOLD | DONE | ARCHIVED`; `dueDate` là `YYYY-MM-DD` có thật, năm 1900–2100, hoặc `null`; lưu nửa đêm UTC, đọc lại theo UTC. Tên trùng so không phân biệt hoa thường (`ILIKE` đã thoát `\ % _`), kèm bắt lỗi unique `P2002` của DB.
- Kiểm trùng tên rồi mới ghi, không atomic: hai request đồng thời khác hoa thường có thể cùng qua (unique của DB chỉ chặn trùng chính xác).
- Chưa có: rate limit, giới hạn kích thước body, kiểm tra `Content-Type` / `Origin` (T73).
- Giao diện vẫn dùng store demo; nối vào API ở T59.

`src/proxy.ts` chỉ kiểm tra lạc quan (có cookie phiên hay không). Kiểm tra thật nằm ở `getViewer()` và ở từng API route (`auth()`).

## Giai đoạn 2 (chưa làm)

- API route `tasks` dùng Prisma + Zod (đã có `spaces`, `projects`, theo cùng mẫu) (`src/domain/validation.ts`); kiểm tra `task.spaceId` khớp `project.spaceId`.
- Logic truy vấn đặt ở `src/server/`, route trong `src/app/api/` chỉ parse input, gọi hàm server và trả kết quả.
- Thay `src/store/workspace-store.ts` bằng TanStack Query gọi API. Giao diện chỉ phụ thuộc `useWorkspace()` / `updateWorkspace()`, nên các file trong `features/` không phải sửa.
- Khi trang render từ dữ liệu server, đổi `experimental.instantInsights.validationLevel` trong `next.config.ts` về `"warning"`.
