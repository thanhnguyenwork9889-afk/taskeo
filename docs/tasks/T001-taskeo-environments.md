# T001 · Đặt tên Taskeo + ba môi trường dev / staging / production

| | |
|---|---|
| Nhánh | `chore/T001-taskeo-environments` |
| Tạo từ | `develop` @ `809201f` |
| Trạng thái | 4-review |
| Ngày tạo | 2026-11-24 |

## 1. Docs – yêu cầu

**Mục tiêu:** Ứng dụng mang tên **Taskeo** ở mọi chỗ người dùng nhìn thấy, và có ba môi trường rõ ràng `development` / `staging` / `production`, mỗi môi trường có cấu hình, cơ sở dữ liệu và OAuth riêng, gắn với nhánh git và Vercel.

**Phạm vi:**
- Tên: hằng `APP_NAME = "Taskeo"` dùng chung cho metadata (`<title>`), logo ở sidebar và trang `/login`; `package.json` / `package-lock.json` đổi `name` thành `taskeo`; README và tiêu đề tài liệu.
- Biến `NEXT_PUBLIC_APP_ENV` (`development` | `staging` | `production`). Hàm thuần `resolveAppEnv()` trong `src/config`: ưu tiên `NEXT_PUBLIC_APP_ENV`; không có thì suy từ `NEXT_PUBLIC_VERCEL_ENV` (`production` → production, `preview` → staging, `development` → development); không có nữa thì `NODE_ENV === "production"` → production, còn lại development. Giá trị sai → ném lỗi rõ ràng (fail fast).
- An toàn: ở `staging` và `production`, thiếu toàn bộ biến auth **không** được rơi về chế độ demo — `getAuthMode()` trả `misconfigured` (chặn truy cập). Demo chỉ cho phép ở `development`.
- Nhận biết môi trường: ngoài production, `<title>` có hậu tố (vd. `Taskeo · Staging`) và sidebar có nhãn môi trường; production không hiện nhãn.
- Mẫu biến môi trường: `.env.example` (development), `.env.staging.example`, `.env.production.example`; `.gitignore` cho phép commit các file mẫu này.
- Tài liệu: bảng ba môi trường (nhánh git ↔ Vercel ↔ DB ↔ OAuth redirect URI ↔ `NEXT_PUBLIC_APP_ENV`): `develop` → Vercel Preview = staging, `main` → Vercel Production, máy local = development.

**Ngoài phạm vi:**
- Tạo project Vercel, database Neon/Supabase, OAuth client thật (người dùng tự làm theo tài liệu).
- CI GitHub Actions (backlog B9), Docker.
- Đổi tên thư mục repo, tên kiểu trong `domain/` (`WorkspaceState`…) và mô tả agent trong `.claude/`.
- Script npm riêng cho từng môi trường (môi trường do Vercel / biến quyết định, không cần script).

**Tiêu chí nghiệm thu** (mỗi dòng kiểm tra được):
- [ ] `grep` không còn chữ "Workspace" là tên app trong `src/app/layout.tsx`, `sidebar.tsx`, `login/page.tsx`; ba chỗ đều đọc `APP_NAME`.
- [ ] `package.json` có `"name": "taskeo"`.
- [ ] Test `resolveAppEnv`: đủ 3 giá trị hợp lệ, suy từ `VERCEL_ENV` (3 trường hợp), suy từ `NODE_ENV`, giá trị sai ném lỗi.
- [ ] Test `getAuthMode`: không có biến auth → `demo` ở development, `misconfigured` ở staging và production; đủ biến → `configured` ở cả ba.
- [ ] `<title>` = `Taskeo` ở production, có hậu tố môi trường ở development / staging; nhãn môi trường ở sidebar chỉ hiện ngoài production (kiểm tra bằng dev server).
- [ ] Có `.env.example`, `.env.staging.example`, `.env.production.example`, đều có `NEXT_PUBLIC_APP_ENV` đúng giá trị; `git check-ignore` không bỏ qua chúng nhưng vẫn bỏ qua `.env.local`.
- [ ] docs/01 có bảng ba môi trường; docs/02 liệt kê redirect URI cho cả ba; docs/03 nêu DB riêng mỗi môi trường.
- [ ] typecheck, lint, test, build xanh.

**Tài liệu bị ảnh hưởng:** 01 môi trường · 02 Google · 03 DB · 04 kiến trúc · README

## 2. Kế hoạch từng phần

| Phần | Việc | File | Agent | Test cần viết |
|---|---|---|---|---|
| P1 | Module cấu hình thuần `src/config/app.ts`: `APP_NAME = "Taskeo"`, kiểu `AppEnv`, `resolveAppEnv({appEnv, vercelEnv, nodeEnv})` (APP_ENV → VERCEL_ENV → NODE_ENV; giá trị sai ném lỗi nêu tên biến + giá trị hợp lệ), `getAppEnv()` đọc `process.env.NEXT_PUBLIC_*` dạng literal, `appTitle(env)`, `appEnvLabel(env)` (null ở production). Trong `env.ts` tách hàm thuần `resolveAuthMode(appEnv, missing)`; `getAuthMode()` giữ chữ ký. Import `./app` tương đối (ESLint cấm `@/*` trong src/config). proxy.ts / session.ts chỉ sửa comment. | `src/config/app.ts`, `app.test.ts`, `env.ts`, `env.test.ts`, `src/proxy.ts`, `src/server/auth/session.ts` | google-integrator | `resolveAppEnv`: 3 giá trị hợp lệ; APP_ENV thắng VERCEL_ENV; VERCEL_ENV ×3; NODE_ENV; giá trị sai ném lỗi. `appTitle` / `appEnvLabel` ×3. `resolveAuthMode`: không biến → demo (dev) / misconfigured (staging, prod); đủ → configured ×3; thiếu một phần → misconfigured ×3. |
| P2 | Giao diện: `metadata.title = appTitle(getAppEnv())`; logo sidebar + /login dùng `APP_NAME`; nhãn môi trường ở sidebar khi `appEnvLabel` ≠ null; thông báo misconfigured ở staging/prod hướng dẫn đặt biến trên Vercel. Breadcrumb gốc "Workspace / …" ở 4 trang đổi sang `APP_NAME`. | `src/app/layout.tsx`, `src/components/layout/sidebar.tsx`, `src/app/(auth)/login/page.tsx`, `src/features/{calendar/calendar-view,docs/docs-view,spaces/space-detail,tasks/tasks-view}.tsx` | feature-builder | Không (logic ở P1). Kiểm bằng grep + dev server. |
| P3 | Cấu hình gốc: `name: "taskeo"` trong package.json / package-lock.json; `.env.example` thêm `NEXT_PUBLIC_APP_ENV=development`; tạo `.env.staging.example`, `.env.production.example`; `.gitignore` thêm `!.env.*.example`. | `package.json`, `package-lock.json`, `.env*.example`, `.gitignore` | tự làm | `git check-ignore` với 3 file mẫu và `.env.local`. |
| P4 | Tài liệu: bảng ba môi trường (local = development; `develop` → Vercel Preview = staging; `main` → Vercel Production) với DB, redirect URI, `NEXT_PUBLIC_APP_ENV`, quy tắc ưu tiên, fail-fast; docs/02 redirect URI ×3; docs/03 DB riêng; docs/04 `src/config/app.ts` + "demo chỉ ở development"; README / tiêu đề sang Taskeo. | `docs/01..04`, `README.md` | tự làm | Không. |

Thứ tự: P1, P3, P4 song song (khác file) → P2 sau P1 → 4 lệnh + dev server.

Rủi ro / phụ thuộc:
- Next chỉ inline `NEXT_PUBLIC_*` khi truy cập literal, lúc build: đổi môi trường trên Vercel phải build lại.
- `next start` ở local đặt `NODE_ENV=production`: không đặt `NEXT_PUBLIC_APP_ENV` và không có biến auth thì bị chặn (`misconfigured`). Đúng thiết kế; ghi vào docs/01, `.env.example` đặt sẵn `development`.
- Vercel Preview cũng là production build: khuyến nghị đặt `NEXT_PUBLIC_APP_ENV` tường minh cho từng môi trường trên Vercel.
- `getAppEnv()` ném lỗi khi giá trị sai → lỗi ở proxy, SSR và client; thông báo phải rõ ràng.

Duyệt kế hoạch: ☐ chờ · ☑ người dùng đã duyệt (2026-11-24) · ☐ bỏ qua (`--yes`)

## 3. Thực hiện + kiểm thử

| Phần | Commit | Test thêm | typecheck | lint | test | build |
|---|---|---|---|---|---|---|
| P1 | `8e79c34` | `src/config/app.test.ts` (16), `src/config/env.test.ts` (9) | ✅ | ✅ | ✅ 47/47 | ✅ |
| P2 | `5d7bb2b` | — (logic ở P1); kiểm dev server: title `Taskeo · Dev`, nhãn "Dev", breadcrumb `Taskeo / Công việc`, demo vẫn chạy | ✅ | ✅ | ✅ 47/47 | ✅ |
| P3 | `cf46db4` | `git check-ignore`: 3 file mẫu không bị bỏ qua, `.env.local` vẫn bị bỏ qua | ✅ | ✅ | ✅ | ✅ |
| P4 | `806bf75` | — | — | — | — | — |

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
