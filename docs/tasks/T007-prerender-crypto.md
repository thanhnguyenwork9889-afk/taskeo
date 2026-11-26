# T007 · Sửa lỗi prerender `crypto.getRandomValues()` trên route `/`

| | |
|---|---|
| Nhánh | `fix/T007-prerender-crypto` |
| Tạo từ | `develop` @ `477042a` |
| Trạng thái | 4-review |
| Ngày tạo | 2026-11-26 |

Nguồn: phát hiện trong log `next dev` lúc kiểm thật T006; người dùng yêu cầu sửa, ghi chú lại, kiểm xong thì push `develop` (2026-11-26). Kế hoạch coi như đã duyệt cùng yêu cầu (`--yes`).

## 1. Docs – yêu cầu

**Mục tiêu:** Hết lỗi `Error: Route "/": Next.js encountered the unstable value crypto.getRandomValues() while prerendering` trong log `next dev`, không làm mất static shell của các trang trong `(app)`.

**Nguyên nhân (đã truy):**
- `next.config.ts` bật `cacheComponents` + `partialPrefetching`. Với hai cờ này, mọi giá trị ngẫu nhiên gặp lúc prerender phải nằm sau `await connection()` (docs Next: `01-app/01-getting-started/08-caching.md`, mục random values).
- `src/app/(app)/layout.tsx` gọi `getViewer()` (không await, truyền Promise xuống `AppShell`). `getViewer()` ở chế độ configured gọi `auth()` của Auth.js.
- `auth()` đọc `headers()` rồi chạy `@auth/core` `init` → `createCSRFToken` → `randomString` → `crypto.getRandomValues()`, **chỉ khi request chưa có cookie CSRF hợp lệ**. Lúc prerender (render prefetch), `headers()` vẫn có giá trị nhưng không có cookie đó → gọi `getRandomValues` → Next báo lỗi. Vì vậy lỗi lúc có lúc không: chỉ hiện ở lần render kiểm tra sau khi module được biên dịch lại.
- Không liên quan code của T006; `src/` không tự gọi `getRandomValues` lúc render (`crypto.randomUUID()` duy nhất nằm trong `newId` của store demo, chỉ chạy khi thao tác).

**Phạm vi:** `src/server/auth/session.ts` — `await connection()` trước khi import / gọi `auth()` trong `getViewer()` (nhánh configured). Chế độ demo và misconfigured giữ nguyên (không có giá trị ngẫu nhiên, vẫn prerender được).

**Ngoài phạm vi:** `getApiUserId()` (chỉ dùng trong API route: GET đã gọi `connection()`, POST / PATCH / DELETE không prerender). Đổi cấu hình `next.config.ts`.

**Tiêu chí nghiệm thu:**
- [ ] Test: ở chế độ configured, `getViewer()` gọi `connection()` trước `auth()`; demo không gọi `connection()` / `auth()`.
- [ ] Trên `next dev`: biên dịch lại `session.ts` bản cũ → log có lỗi (tái hiện); bản sửa → biên dịch lại và tải `/` không còn lỗi.
- [ ] Trang `/` vẫn hiện người dùng đăng nhập; `npm run build` vẫn cho `/` là `◐` (có static shell).
- [ ] typecheck, lint, test, build xanh.

**Tài liệu bị ảnh hưởng:** không (ghi chú nằm ở file này và comment trong code).

## 2. Kế hoạch từng phần

| Phần | Việc | File | Agent | Test cần viết |
|---|---|---|---|---|
| P1 | `await connection()` trước `auth()` trong `getViewer()` | `src/server/auth/session.ts` + test | Claude (sửa 1 dòng, vùng `google-integrator`) | thứ tự `connection` → `auth`; demo / misconfigured không gọi `auth`; đăng xuất → `null` |

Duyệt kế hoạch: ☐ chờ · ☐ người dùng đã duyệt (ngày) · ☒ bỏ qua (`--yes`: người dùng yêu cầu sửa và push trong cùng tin nhắn)

## 3. Thực hiện + kiểm thử

| Phần | Commit | Test thêm | typecheck | lint | test | build |
|---|---|---|---|---|---|---|
| P1 | `7b6056b` | `session.test.ts` (+4, `getViewer`) | ✅ | ✅ | ✅ 573/573 | ✅ (`/` = `◐`) |

Kiểm trên `next dev` cổng 3000 (configured, đã đăng nhập), đếm dòng `blocking-prerender-crypto` trong `.next/dev/logs/next-development.log`:
- Viết test trước: 2 test `getViewer` đỏ (`expected [ 'auth' ] to deeply equal [ 'connection', 'auth' ]`), sửa xong 11/11 xanh.
- Đặt lại `session.ts` bản cũ → biên dịch lại (00:18:00) → lỗi xuất hiện ngay (6 → 7).
- Gắn bản sửa → biên dịch lại (00:18:18), tải `/` hai lần → không có lỗi mới (vẫn 7). Trang hiện đúng tên người dùng.

## 4. Review code

Reviewer đã chạy:

| # | Mức | File:dòng | Vấn đề | Reviewer |
|---|---|---|---|---|
| R1 | | | | |

## 5. Fix bug

| Phát hiện | Xử lý | Commit |
|---|---|---|

## 6. Review lại

## 7. Final

**Tóm tắt:**

**Tiêu chí nghiệm thu:** (đánh dấu ở mục 1)

**Merge vào develop:** commit `<hash>`, ngày

**Việc để sau:**
-
