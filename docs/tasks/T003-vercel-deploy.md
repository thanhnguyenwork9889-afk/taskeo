# T003 · Deploy lên Vercel (production) + bỏ môi trường staging

| | |
|---|---|
| Nhánh | `chore/T003-vercel-deploy` |
| Tạo từ | `develop` @ `17790f6` |
| Trạng thái | 7-final |
| Ngày tạo | 2026-11-24 |

Sheet nhiệm vụ: T08 (deploy bản trống lên Vercel, thêm redirect URI production). Chạm tới T63 (tách Preview / Production + 2 database) ở mức đặt biến; phần migrate tự động khi deploy vẫn là T67.

## 1. Docs – yêu cầu

**Mục tiêu:** Taskeo chạy trên Vercel production (nhánh `main`, `taskeo-zeta.vercel.app`) với database Neon, OAuth client và secret riêng, nút đăng nhập Google chuyển sang Google với đúng redirect URI; app chỉ còn hai môi trường, development và production.

Quyết định với người dùng (2026-11-24, trong chat), theo thứ tự thời gian:
1. Domain miễn phí `*.vercel.app`; domain riêng để sau (T71). Các bước trên Vercel / Google Cloud Console / Neon do người dùng tự bấm theo checklist; Claude không nhập secret, không tạo tài khoản, chỉ kiểm tra URL đã deploy.
2. Ban đầu làm cả staging (Preview, nhánh `develop`) và production, production qua `/task release`.
3. Đổi phạm vi lần 1 ("Bỏ luôn staing"): không dựng staging trên Vercel. Bỏ luôn bước release: production đã chạy từ `main` hiện tại; thay đổi của T003 lên `main` ở lần release sau.
4. **Đổi phạm vi lần 2 ("Xóa luôn môi trường staging") — phạm vi hiện hành:** bỏ hẳn staging khỏi app. Vercel Preview (`NEXT_PUBLIC_VERCEL_ENV=preview`) được coi là production: chế độ chặt nhất (không demo, thông báo chặn chung, không nhãn), và bị chặn vì không đặt biến nào cho Environment Preview. `NEXT_PUBLIC_APP_ENV=staging` là giá trị không hợp lệ (fail fast). Việc ngoài repo, người dùng tự quyết: xoá Neon branch `staging`, OAuth client `Taskeo Staging`, file local `.env.staging.secrets`.

**Phạm vi:**
- `docs/08-deploy.md`: checklist dựng production (project Vercel từ GitHub, Production Branch = `main`, Node 24.x, Deployment Protection, domain, OAuth client `Taskeo`, 6 biến chỉ ở Environment Production, `db:deploy` lên Neon `main`, Redeploy, cách kiểm tra).
- `package.json`: script `db:deploy` (`prisma migrate deploy`, đọc `DATABASE_URL` / `DIRECT_URL` từ shell) và `engines.node` `24.x`.
- Điền domain production vào `docs/01`, `docs/02`, `.env.production.example`.
- Bỏ môi trường staging: `src/config/app.ts` (+ test), `sidebar.tsx`, chú thích `env.ts` / `proxy.ts`; docs 01/02/03/04, README, `.env.example`; xoá `.env.staging.example`.
- README: dòng 08 trong bảng tài liệu.

**Ngoài phạm vi:**
- Chạy `prisma migrate deploy` tự động trong build Vercel (T67).
- Đăng nhập Google trọn vòng và lưu token ở production (T15 kiểm ở development trước).
- Domain riêng, consent screen In production (T71); `/api/health`, Sentry (T64, T65); merge qua PR + CI (T72, T52); release `develop` → `main`.

**Tiêu chí nghiệm thu** (mỗi dòng kiểm tra được):
- [x] `docs/08-deploy.md` có checklist đủ các bước ở *Phạm vi*; README liệt kê 08.
- [x] `npm run db:deploy` có trong `package.json`; `package.json` có `engines.node` (`24.x`).
- [ ] Neon branch `main`: `prisma migrate status` báo "Database schema is up to date" (người dùng chạy, dán kết quả).
- [x] Production `taskeo-zeta.vercel.app`: tiêu đề `Taskeo`, `/login` hiện nút đăng nhập Google; bấm thì sang `accounts.google.com` với `redirect_uri` là domain production, không có `redirect_uri_mismatch`.
- [x] Không còn chuỗi `<domain-production>` / `<domain-staging>` trong repo.
- [x] Không còn môi trường staging trong `src/`: `APP_ENVS` = development / production, `preview` → production, `NEXT_PUBLIC_APP_ENV=staging` ném lỗi; có test cho hai điều trên; docs và file env mẫu chỉ nói hai môi trường.
- [x] typecheck, lint, test, build xanh (59/59, sau commit `9a773c0`).

**Tài liệu bị ảnh hưởng:** 01 môi trường · 02 Google · 03 DB (lệnh `db:deploy`) · 04 kiến trúc (`app.ts`) · 08 mới

## 2. Kế hoạch từng phần

| Phần | Việc | File | Agent | Test cần viết |
|---|---|---|---|---|
| P1 | Checklist deploy + script `db:deploy` + `engines` + README | `docs/08-deploy.md`, `package.json`, `README.md`, `docs/01`, `docs/03` | tự làm (docs + cấu hình nhỏ) | không (cấu hình); kiểm `db:deploy` khi thiếu biến thì dừng |
| P2 | Người dùng làm theo checklist: project Vercel, biến Production, client `Taskeo`, `db:deploy` lên Neon `main`, Redeploy | ngoài repo | người dùng | — |
| P3 | Điền domain production vào docs + file env mẫu; kiểm URL production bằng trình duyệt (tiêu đề, `/login`, `redirect_uri`) | `docs/01`, `docs/02`, `.env.production.example` | tự làm | không; kiểm tay |
| P4 | Bỏ môi trường staging: code + test (agent); docs, README, `.env.example`, xoá `.env.staging.example` (tự làm) | `src/config/*`, `src/components/layout/sidebar.tsx`, `src/proxy.ts`, docs, env mẫu | `google-integrator` + tự làm | `app.test.ts`: preview → production; `staging` ném lỗi |

Kế hoạch đã duyệt ban đầu có P2–P4 khác (staging + release); đổi theo quyết định 3–4 ở mục 1.

Rủi ro / phụ thuộc:
- URL preview ngẫu nhiên theo commit không đăng nhập Google được (redirect URI phải khớp chính xác).
- Preview được coi là production: nếu ai đó tick Environment Preview khi đặt biến, mọi bản Preview chạy với secret và database production. Checklist cấm tick Preview.
- Đổi bất kỳ biến nào phải Redeploy: `/login` dựng sẵn lúc build.
- Auth.js v5 tự tin host khi chạy trên Vercel (biến `VERCEL`), không cần `AUTH_URL` / `AUTH_TRUST_HOST`.

Duyệt kế hoạch: ☐ chờ · ☑ người dùng đã duyệt (2026-11-24, trong chat: "Approve plan") · ☐ bỏ qua (`--yes`)

Kế hoạch tự viết, không qua `planner` (như T002): việc chủ yếu là tài liệu, cấu hình nhỏ và thao tác của người dùng trên giao diện web.

## 3. Thực hiện + kiểm thử

| Phần | Commit | Test thêm | typecheck | lint | test | build |
|---|---|---|---|---|---|---|
| P1 | `315f4e8` | không; `npm run db:deploy` khi shell không có `DATABASE_URL` / `DIRECT_URL` → Prisma báo lỗi validate và dừng, không chạm database | ✅ | ✅ | ✅ 61/61 | ✅ |
| P2 | — | người dùng: project Vercel `taskeo`, domain production `taskeo-zeta.vercel.app` (đổi từ `taskeo-sigma`), 6 biến Production, client `Taskeo`, Redeploy. Staging: chưa xong | | | | |
| P3a (production) | `04fd3a9` | kiểm tay trên `taskeo-zeta.vercel.app` | ✅ | ✅ | ✅ | ✅ |
| P4 | (commit này) | 2 test mới trong `app.test.ts` (viết trước: 5 test đỏ với code cũ, xanh sau khi sửa); bỏ 5 test staging → 58 test (+1 test R6 ở bước 5 → 59) | ✅ | ✅ | ✅ 58/58 | ✅ |

Ghi chú P2/P3a (2026-11-24, trước khi bỏ staging):
- Bản build đầu chạy trước khi có biến: `/login` báo chặn. Đặt biến xong vẫn báo chặn vì `/login` được dựng sẵn lúc build (`x-nextjs-prerender: 1`, `x-vercel-cache: HIT`, `age` 1990 s) → phải Redeploy. Đã ghi vào `docs/08-deploy.md` bước 6: đổi biến nào cũng phải build lại.
- Sau Redeploy: tiêu đề `Taskeo`, `/login` có nút "Đăng nhập bằng Google"; bấm thì sang `accounts.google.com` với `redirect_uri=https://taskeo-zeta.vercel.app/api/auth/callback/google`, `scope=openid email profile`, `access_type=offline`, `prompt=consent`, không có `redirect_uri_mismatch`. Không đăng nhập tiếp (T15).
- Người dùng đã dán giá trị thật (chuỗi Neon, Google Client ID / Secret) vào `.env.production.example` / `.env.staging.example` (chưa commit). Đã chuyển sang `.env.production.secrets` / `.env.staging.secrets` (git bỏ qua theo `.env*`, Next.js không tự đọc) và trả hai file mẫu về placeholder.
- Thêm vào `docs/08-deploy.md`: tắt Vercel Authentication cho Preview (bước 1.6). Sau P4 đổi thành giữ bật, vì không còn staging.

Ghi chú P1: `engines.node` đặt `24.x` thay cho `>=20.9` như mục 1: Vercel coi khoảng mở là "bản mới nhất" và cảnh báo; `24.x` khớp Node của máy dev (24.11.1). Next.js vẫn chỉ cần 20.9+ (docs/01).

## 4. Review code

Reviewer đã chạy (song song, trên `git diff develop...HEAD` @ `0253bf0`): `layer-reviewer`, `typescript-reviewer`, `security-reviewer`. Không có CRITICAL / HIGH. Quét secret trên mọi commit của nhánh (`GOCSPX`, `neondb_owner`, `apps.googleusercontent.com`, `npg_`): 0 kết quả.

| # | Mức | File:dòng | Vấn đề | Reviewer |
|---|---|---|---|---|
| R1 | MEDIUM | `docs/tasks/T003-vercel-deploy.md:14-26, 52-62` | Mục tiêu, quyết định, phạm vi, P2/P3 và rủi ro còn nói staging (`.env.staging.example`, `Taskeo Staging`, `<domain-staging>`, "code vẫn hỗ trợ ba môi trường"), mâu thuẫn với đổi phạm vi lần 2 | layer |
| R2 | MEDIUM | `docs/tasks/T003-vercel-deploy.md:42` | Tiêu chí bỏ staging chưa tick dù đã làm; câu "hai điều sau" sai (phải là "hai điều trên") | layer |
| R3 | LOW | `docs/08-deploy.md` §4, `docs/01-environment.md:35` | "Preview luôn bị chặn" chỉ đúng khi không ai đặt biến cho Environment Preview; đặt biến Preview = đưa secret production lên Preview, chạy `configured` không nhãn | security + layer |
| R4 | LOW | `docs/08-deploy.md` §5 | Gõ `$env:DATABASE_URL = "<chuỗi>"` thì PSReadLine lưu chuỗi kết nối (có mật khẩu) vào file lịch sử PowerShell | security |
| R5 | LOW | `src/config/app.test.ts` | Mapping preview → production được kiểm ở 3 test (trùng) | typescript |
| R6 | LOW | `src/config/app.test.ts` | Không có test `vercelEnv: "staging"` ném lỗi | typescript |
| R7 | LOW | `src/config/app.ts:38` | Thông báo lỗi `NEXT_PUBLIC_VERCEL_ENV` liệt kê "production, preview, development" — chỉ thẩm mỹ | typescript |
| R8 | LOW | `docs/03-database.md:39` vs `docs/08-deploy.md` | "khi release" và "trước khi release" — cách viết khác nhau | layer |
| R9 | LOW | `.env.local:2-5`, `.env.staging.secrets` (git bỏ qua) | Chú thích `.env.local` còn nhắc staging; file `.env.staging.secrets` còn trên máy | typescript |

## 5. Fix bug

| Phát hiện | Xử lý | Commit |
|---|---|---|
| R1 | đã sửa: viết lại Mục tiêu, Phạm vi, Ngoài phạm vi, kế hoạch và rủi ro theo phạm vi hiện hành; các lần đổi phạm vi giữ thành danh sách quyết định theo thời gian | (commit này) |
| R2 | đã sửa: tick tiêu chí bỏ staging, "hai điều sau" → "hai điều trên" | (commit này) |
| R3 | đã sửa: `docs/08` (đầu trang + bước 4) và `docs/01` cấm tick Environment Preview, nói rõ hậu quả | (commit này) |
| R4 | đã sửa: `docs/08` bước 5 dùng `Read-Host` để chuỗi kết nối không vào lịch sử PSReadLine; `docs/03` nhắc theo | (commit này) |
| R5 | bỏ qua: test riêng có tên nói rõ ý đồ (preview được coi là production); trùng nhưng rẻ | — |
| R6 | đã sửa (`google-integrator`): test `vercelEnv: "staging"` ném lỗi nêu `NEXT_PUBLIC_VERCEL_ENV` và `"staging"` | (commit này) |
| R7 | bỏ qua: chỉ thẩm mỹ, thông báo liệt kê đúng giá trị Vercel hợp lệ | — |
| R8 | đã sửa: `docs/03` và `docs/08` cùng viết "khi release `develop` → `main`, trước khi bản production mới được deploy" | (commit này) |
| R9 | bỏ qua: hai file local, git bỏ qua, của người dùng; báo người dùng tự sửa / xoá | — |

Kết quả 4 lệnh sau khi sửa: typecheck ✅ · lint ✅ · test ✅ 59/59 · build ✅

## 6. Review lại

Vòng 1 (`git diff 4fb38b4..9a773c0`, cùng ba reviewer): không còn CRITICAL / HIGH / MEDIUM. `layer-reviewer`: R1–R4, R6, R8 đã sửa đúng, anchor khớp; LOW: số test P4 lệch (58 → 59 sau R6) và tiêu chí 4 lệnh chưa tick — sửa ở bước 7. `typescript-reviewer`: sạch. `security-reviewer`: sạch; xác nhận `Read-Host` không đưa giá trị vào lịch sử PSReadLine (giá trị vẫn hiện trên màn hình đến khi đóng cửa sổ — chấp nhận); không có secret trong diff.

## 7. Final

**Tóm tắt:**

**Tiêu chí nghiệm thu:** (đánh dấu ở mục 1)

**Tài liệu đã cập nhật:**

**Merge vào develop:** commit `<hash>`, ngày

**Việc để sau:**
-
