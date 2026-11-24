# Nhiệm vụ

Quy trình: [07-workflow.md](../07-workflow.md). Mẫu: [_template.md](_template.md). Mã tiếp theo = mã lớn nhất trong bảng + 1.

| Mã | Nhiệm vụ | Nhánh | Trạng thái | Merge vào develop |
|---|---|---|---|---|
| T000 | [Thiết lập quy trình nhiệm vụ](T000-task-workflow.md) | `chore/T000-task-workflow` | done | `828ef1f` |
| T001 | [Đặt tên Taskeo + ba môi trường](T001-taskeo-environments.md) | `chore/T001-taskeo-environments` | done | `d3f97b9` |
| T002 | [Database Neon + migration đầu tiên](T002-neon-database.md) | `chore/T002-neon-database` | done | `81ccd2d` |
| T003 | [Deploy lên Vercel (production) + bỏ staging](T003-vercel-deploy.md) | `chore/T003-vercel-deploy` | done | `13292dc` |

## Việc chờ làm (backlog)

Chưa có mã, nhánh hay file. Khi bắt đầu, chạy `/task new <mô tả>` để cấp mã theo bảng trên; thứ tự dưới đây là thứ tự đề xuất. Cập nhật lần cuối: 2026-11-23, theo code ở `develop` @ `2f46b34`.

### Hiện trạng (2026-11-23)

- Giai đoạn 1 đã có khung: Auth.js + Google, adapter Prisma, mã hoá token, `proxy.ts`, ba chế độ chạy. Chưa chạy thử với Google thật và chưa có migration (`prisma/` chỉ có `schema.prisma`).
- Dữ liệu vẫn là chế độ demo: `src/store/workspace-store.ts` lưu localStorage; mọi trang vẽ hoàn toàn ở trình duyệt.
- Drive (giai đoạn 3) và Calendar (giai đoạn 4) mới là chữ chú thích và dữ liệu mẫu trong giao diện.
- typecheck xanh, 22/22 test (chỉ `domain/`: dates, task-filters, workspace-actions).

### Danh sách

| # | Việc | Loại | Agent chính | Phụ thuộc | Nguồn |
|---|---|---|---|---|---|
| B1 | Migration Prisma đầu tiên + kiểm thử đăng nhập Google thật ở chế độ `configured` (lưu token đã mã hoá, refresh) | chore | `google-integrator` | cần `.env.local`, Postgres | [03](../03-database.md), [02](../02-google-cloud.md) |
| B2 | Hàm truy vấn `src/server/` + API route `spaces` / `projects` / `tasks` (Prisma + Zod, kiểm tra `task.spaceId` khớp `project.spaceId`, mọi route gọi `auth()`) | feat | `api-builder` | B1 | [06](../06-api.md) |
| B3 | Thay store demo bằng TanStack Query giữ nguyên `useWorkspace()` / `updateWorkspace()`; giữ chế độ demo chạy được; đổi `instantInsights.validationLevel` về `"warning"` | feat | `api-builder` | B2 | [06](../06-api.md), `src/app/(app)/layout.tsx` |
| B4 | Ghi `Activity` cho mỗi thay đổi công việc và hiển thị thật ở card Hoạt động | feat | `api-builder` + `feature-builder` | B2 | [03](../03-database.md) |
| B5 | Drive: xin thêm scope `drive.file`, tạo thư mục cho không gian / dự án khi tạo mới | feat | `google-integrator` | B2 | `create-dialog.tsx`, `space-detail.tsx` |
| B6 | Drive: Google Picker thay hộp thoại dán liên kết, route trả access token ngắn hạn; mở file thật; tạo Doc/Sheet/Slide trong thư mục không gian | feat | `google-integrator` + `feature-builder` | B5 | `attach-drive-dialog.tsx`, `docs-view.tsx`, `file-row.tsx`, `task-drawer.tsx` |
| B7 | Calendar: scope `calendar.readonly`, route `/api/calendar/today`, thay `SAMPLE_EVENTS` ở Tổng quan và trang Lịch | feat | `google-integrator` | B1 | `today-calendar.tsx`, `calendar-view.tsx` |
| B8 | Calendar (tuỳ chọn): scope `calendar.events`, tạo sự kiện từ công việc | feat | `google-integrator` | B7 | `task-drawer.tsx` |
| B9 | CI: chạy typecheck / lint / test / build trên GitHub Actions cho PR vào `develop` và `main` | ci | tự làm | — | T000 · ngoài phạm vi |
| B10 | Test ngoài `domain/`: test tích hợp cho API route (B2) và e2e cho luồng tạo / hoàn thành công việc | test | `api-builder` / `feature-builder` | B2 | quy tắc test 80% |

### Việc cần người dùng tự làm (không phải nhiệm vụ code)

- Bật branch protection cho `main` trên GitHub (T000 · việc để sau).
- Quyết định với nhánh local `master` (đang ở `b4e7a34`, lệch `origin/main`): xoá hay đồng bộ.
- Nhánh `feat/app-shell-scaffold` ở local đi trước remote 1 commit (`0d93f3a`, đã có trong `develop`): push hoặc bỏ.
- Trước giai đoạn 3–4: đối chiếu phân loại scope trên Google Cloud Console ([02](../02-google-cloud.md)).
