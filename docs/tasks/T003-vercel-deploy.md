# T003 · Deploy lên Vercel (staging + production)

| | |
|---|---|
| Nhánh | `chore/T003-vercel-deploy` |
| Tạo từ | `develop` @ `17790f6` |
| Trạng thái | 3-build |
| Ngày tạo | 2026-11-24 |

Sheet nhiệm vụ: T08 (deploy bản trống lên Vercel, thêm redirect URI production). Chạm tới T63 (tách Preview / Production + 2 database) ở mức đặt biến; phần migrate tự động khi deploy vẫn là T67.

## 1. Docs – yêu cầu

**Mục tiêu:** Taskeo chạy trên Vercel ở hai môi trường: staging (Preview, nhánh `develop`) và production (nhánh `main`), mỗi môi trường có database Neon, OAuth client và secret riêng, và nút đăng nhập Google chuyển sang Google với đúng redirect URI.

Quyết định với người dùng (2026-11-24, trong chat):
- Domain: dùng domain miễn phí `*.vercel.app` (production = domain chính của project, staging = alias cố định của nhánh `develop`). Domain riêng để sau (T71 cần domain đã xác minh).
- Làm cả staging và production. Production cần merge `develop` → `main`: chỉ làm qua `/task release` khi người dùng cho phép trong chat ở thời điểm đó.
- Các bước trên Vercel / Google Cloud Console / Neon do người dùng tự bấm theo checklist; Claude không nhập secret, không tạo tài khoản. Claude kiểm tra URL đã deploy sau đó.

**Phạm vi:**
- `docs/08-deploy.md`: checklist deploy từng bước (tạo project Vercel từ GitHub, Production Branch = `main`, Node version, biến môi trường cho Preview (Branch `develop`) và Production theo `.env.staging.example` / `.env.production.example`, tạo OAuth client `Taskeo Staging` và `Taskeo` với redirect URI, chạy `prisma migrate deploy` lên Neon branch `staging` và `main`, cách kiểm tra).
- `package.json`: script `db:deploy` (`prisma migrate deploy`, đọc `DATABASE_URL` / `DIRECT_URL` từ biến môi trường của shell, không cần file env có secret production nằm trên máy) và `engines.node` `>=20.9`.
- Sau khi người dùng tạo xong project: thay `<domain-staging>` / `<domain-production>` bằng domain thật trong `docs/01`, `docs/02`, `.env.staging.example`, `.env.production.example`.
- README: thêm dòng 08 vào bảng tài liệu.

**Ngoài phạm vi:**
- Chạy `prisma migrate deploy` tự động trong build Vercel (T67).
- Đăng nhập Google trọn vòng và lưu token ở staging / production (T15 kiểm ở development trước).
- Domain riêng, consent screen In production (T71); `/api/health`, Sentry (T64, T65); merge qua PR + CI (T72, T52).

**Tiêu chí nghiệm thu** (mỗi dòng kiểm tra được):
- [ ] `docs/08-deploy.md` có checklist đủ các bước ở *Phạm vi*; README liệt kê 08.
- [ ] `npm run db:deploy` có trong `package.json`; `package.json` có `engines.node` (`24.x`).
- [ ] Neon branch `staging` và `main`: `prisma migrate status` báo "Database schema is up to date" (người dùng chạy, dán kết quả).
- [ ] URL staging (alias nhánh `develop`) mở được, tiêu đề `Taskeo · Staging`, `/login` hiện nút đăng nhập Google (chế độ `configured`, không phải thông báo chặn).
- [ ] Bấm đăng nhập ở staging chuyển tới `accounts.google.com` với `redirect_uri=https://<domain-staging>/api/auth/callback/google`, Google không báo `redirect_uri_mismatch`.
- [ ] Như hai dòng trên cho production: tiêu đề `Taskeo`, `redirect_uri` là domain production.
- [ ] Không còn chuỗi `<domain-staging>` / `<domain-production>` trong repo.
- [ ] typecheck, lint, test, build xanh.

**Tài liệu bị ảnh hưởng:** 01 môi trường · 02 Google · 03 DB (lệnh `db:deploy`) · 08 mới

## 2. Kế hoạch từng phần

| Phần | Việc | File | Agent | Test cần viết |
|---|---|---|---|---|
| P1 | Checklist deploy + script `db:deploy` + `engines` + README | `docs/08-deploy.md`, `package.json`, `README.md`, `docs/01`, `docs/03` | tự làm (docs + cấu hình nhỏ) | không (cấu hình); kiểm `npm run db:deploy -- --help` chạy được |
| P2 | Người dùng làm theo checklist: project Vercel, biến Preview + Production, 2 OAuth client, `db:deploy` lên Neon `staging` + `main`; báo lại 2 domain và kết quả `migrate status` | ngoài repo | người dùng | — |
| P3 | Điền domain thật vào docs + file env mẫu; kiểm URL staging bằng trình duyệt (tiêu đề, `/login`, `redirect_uri`) | `docs/01`, `docs/02`, `.env.staging.example`, `.env.production.example` | tự làm | không; kiểm tay trên URL staging |
| P4 | Production: sau bước 7 và merge vào `develop`, chạy `/task release` (hỏi người dùng trước khi merge vào `main` và trước khi push), rồi kiểm URL production như P3 | — | tự làm + người dùng cho phép | không; kiểm tay trên URL production |

Rủi ro / phụ thuộc:
- Staging deploy từ `develop` trên GitHub: nhánh này cần được push (hỏi người dùng trước). Mọi bản deploy chỉ có code đã push.
- URL preview ngẫu nhiên theo commit không đăng nhập Google được (redirect URI phải khớp chính xác); chỉ dùng alias nhánh `develop`.
- Nếu Vercel không bật *Automatically expose System Environment Variables* mà quên `NEXT_PUBLIC_APP_ENV`, Preview bị coi là production (vẫn chặn đúng, nhưng sai nhãn) — checklist bắt đặt tường minh.
- Biến `NEXT_PUBLIC_*` nhúng lúc build: đổi biến phải Redeploy.
- P4 kiểm production sau khi merge vào `develop`, nên dòng nghiệm thu production được đánh dấu bổ sung trong mục 7 sau release.
- Auth.js v5 tự tin host khi chạy trên Vercel (biến `VERCEL`), không cần `AUTH_URL` / `AUTH_TRUST_HOST`.

Duyệt kế hoạch: ☐ chờ · ☑ người dùng đã duyệt (2026-11-24, trong chat: "Approve plan") · ☐ bỏ qua (`--yes`)

Kế hoạch tự viết, không qua `planner` (như T002): việc chủ yếu là tài liệu, cấu hình nhỏ và thao tác của người dùng trên giao diện web.

## 3. Thực hiện + kiểm thử

| Phần | Commit | Test thêm | typecheck | lint | test | build |
|---|---|---|---|---|---|---|
| P1 | (commit này) | không; `npm run db:deploy` khi shell không có `DATABASE_URL` / `DIRECT_URL` → Prisma báo lỗi validate và dừng, không chạm database | ✅ | ✅ | ✅ 61/61 | ✅ |
| P2 | — | người dùng: project Vercel `taskeo`, domain production `taskeo-zeta.vercel.app` (đổi từ `taskeo-sigma`), 6 biến Production, client `Taskeo`, Redeploy. Staging: chưa xong | | | | |
| P3a (production) | (commit này) | kiểm tay trên `taskeo-zeta.vercel.app` | ✅ | ✅ | ✅ | ✅ |

Ghi chú P2/P3a (2026-11-24):
- Bản build đầu chạy trước khi có biến: `/login` báo chặn. Đặt biến xong vẫn báo chặn vì `/login` được dựng sẵn lúc build (`x-nextjs-prerender: 1`, `x-vercel-cache: HIT`, `age` 1990 s) → phải Redeploy. Đã ghi vào `docs/08-deploy.md` bước 6: đổi biến nào cũng phải build lại.
- Sau Redeploy: tiêu đề `Taskeo`, `/login` có nút "Đăng nhập bằng Google"; bấm thì sang `accounts.google.com` với `redirect_uri=https://taskeo-zeta.vercel.app/api/auth/callback/google`, `scope=openid email profile`, `access_type=offline`, `prompt=consent`, không có `redirect_uri_mismatch`. Không đăng nhập tiếp (T15).
- Người dùng đã dán giá trị thật (chuỗi Neon, Google Client ID / Secret) vào `.env.production.example` / `.env.staging.example` (chưa commit). Đã chuyển sang `.env.production.secrets` / `.env.staging.secrets` (git bỏ qua theo `.env*`, Next.js không tự đọc) và trả hai file mẫu về placeholder.
- Thêm vào `docs/08-deploy.md`: tắt Vercel Authentication cho Preview (bước 1.6).

Ghi chú P1: `engines.node` đặt `24.x` thay cho `>=20.9` như mục 1: Vercel coi khoảng mở là "bản mới nhất" và cảnh báo; `24.x` khớp Node của máy dev (24.11.1). Next.js vẫn chỉ cần 20.9+ (docs/01).

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
