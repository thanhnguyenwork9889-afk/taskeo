# T009 · Hoàn tất đăng nhập Google: test token + kiểm thử refresh thật

| | |
|---|---|
| Nhánh | `chore/T009-google-auth-verify` |
| Tạo từ | `develop` @ `e8a8ac7` |
| Trạng thái | 5-fix |
| Ngày tạo | 2026-11-26 |

Nguồn: sheet nhiệm vụ, dòng **T15** "Auth.js + Google provider (openid email profile, access_type=offline, prompt=consent)" — đang *Đang làm*, ghi chú "chưa chạy thử với Google thật" (backlog B1). Liên quan T16 (mã hoá refresh token) và T17 (client tự refresh), cả hai ghi "chưa thử thật".

## 1. Docs – yêu cầu

**Mục tiêu:** Đóng T15: chứng minh bằng test và bằng một lần chạy thật rằng đăng nhập Google xin đúng tham số, lưu token đã mã hoá, cập nhật token khi đăng nhập lại, và refresh token dùng được để lấy access token mới.

**Hiện trạng (kiểm tra 2026-11-26):**
- `src/server/auth/auth.ts` đã cấu hình Auth.js v5 + Google: `scope "openid email profile"`, `access_type=offline`, `prompt=consent`, `include_granted_scopes=true`, Prisma adapter, session `database`, bọc `linkAccount` để mã hoá token, `events.signIn` lưu lại token khi đăng nhập lại.
- DB dev (Neon branch dev): 2 dòng `Account` provider `google`, cả hai có `refresh_token`; refresh / access / id token đều bắt đầu bằng `v1:` (đã mã hoá); `scope` = userinfo.email + userinfo.profile + openid. Production đã đăng nhập thành công (T003).
- Chưa có test nào cho: `src/server/crypto.ts`, phần mã hoá token trong `auth.ts` (`withEncryptedTokens`, `persistReSignInTokens`), tham số provider Google, và `src/server/google/client.ts` (refresh + lưu token mới). Các hàm này đang là hàm nội bộ trong `auth.ts` nên khó test.
- Chưa từng chạy refresh thật (access token dev đã hết hạn, `expires_at` 2026-11-25/26).

**Phạm vi:**
- Tách phần thuần của cấu hình đăng nhập ra module test được (vd. `src/server/auth/google-tokens.ts`): tham số `authorization.params` của Google, hàm mã hoá token của `AdapterAccount` trước `linkAccount`, hàm dựng dữ liệu cập nhật token khi đăng nhập lại. `auth.ts` dùng lại các hàm này, hành vi không đổi.
- Unit test: `crypto.ts` (mã hoá/giải mã khứ hồi, IV khác nhau mỗi lần, sửa ciphertext/tag → lỗi, sai định dạng → lỗi, thiếu/sai độ dài khoá → lỗi), các hàm token ở trên, `google/client.ts` (thiếu refresh token → `GoogleNotConnectedError`; giải mã token khi `setCredentials`; sự kiện `tokens` ghi token mới đã mã hoá và chỉ ghi field có mặt; lỗi ghi DB được log không kèm token).
- Kiểm thử thật một lần trên DB dev (lệnh dùng một lần, không commit): dùng refresh token đã lưu lấy access token mới qua `getGoogleAuth`, kiểm tra `expires_at` trong DB được đẩy lên và token mới vẫn ở dạng `v1:`.
- Cập nhật `docs/02-google-cloud.md`: mục đăng nhập giai đoạn 1 (tham số, vì sao `prompt=consent`, cách kiểm tra token đã lưu mã hoá).

**Ngoài phạm vi:**
- Xin thêm scope Drive / Calendar (T30, T37).
- Xử lý token bị thu hồi trên giao diện (T47), quy trình đổi `TOKEN_ENCRYPTION_KEY` (T74), chuyển consent screen sang In production (T71).
- Test e2e đăng nhập qua trình duyệt (cần tài khoản Google thật; T61).

**Tiêu chí nghiệm thu** (mỗi dòng kiểm tra được):
- [ ] Test khẳng định tham số Google gồm `scope: "openid email profile"`, `access_type: "offline"`, `prompt: "consent"`.
- [ ] Test khẳng định token trước `linkAccount` và khi đăng nhập lại đều được mã hoá (`v1:`), giải mã ra đúng giá trị gốc; field không có thì không bị ghi đè.
- [ ] `crypto.ts` có test cho khứ hồi, dữ liệu bị sửa, sai định dạng, khoá thiếu / sai độ dài.
- [ ] `google/client.ts` có test cho thiếu refresh token, sự kiện `tokens` lưu token mới đã mã hoá, lỗi lưu không làm lộ token trong log.
- [ ] Chạy thật trên DB dev: refresh thành công, `expires_at` mới > thời điểm chạy, token mới bắt đầu bằng `v1:` (ghi kết quả vào mục 3, không ghi giá trị token).
- [ ] `auth.ts` không đổi hành vi (cùng tham số, cùng adapter, cùng callback); 4 lệnh typecheck / lint / test / build xanh.
- [ ] `docs/02-google-cloud.md` có mục đăng nhập giai đoạn 1.

**Tài liệu bị ảnh hưởng:** 02 Google · 04 kiến trúc (nếu thêm file trong `src/server/auth`).

## 2. Kế hoạch từng phần

| Phần | Việc | File | Agent | Test cần viết |
|---|---|---|---|---|
| P1 | Unit test `crypto.ts` (mã nguồn chỉ sửa nếu test lộ lỗi); khoá test qua `vi.stubEnv` | `src/server/crypto.test.ts` (mới) | `google-integrator` | khứ hồi (cả unicode) · định dạng `v1:iv:tag:ct` · IV khác nhau mỗi lần · sửa ciphertext / tag → lỗi · thiếu tiền tố, sai độ dài IV/tag, thiếu data → lỗi · thiếu khoá / khoá ≠ 32 byte → lỗi · khoá khác không giải mã được · `encryptOptional` trả `null` cho null/undefined/"" |
| P2 | Tách `GOOGLE_AUTHORIZATION_PARAMS`, `encryptAdapterAccountTokens`, `buildReSignInTokenUpdate` (thuần, không import prisma) ra module mới; `auth.ts` dùng lại, hành vi không đổi (giữ `?? undefined`, `isNewUser`, `include_granted_scopes: "true"`) | `src/server/auth/google-tokens.ts` (mới), `google-tokens.test.ts` (mới), `src/server/auth/auth.ts` | `google-integrator` | params `toEqual` đủ 4 khoá · mã hoá 3 token `v1:` + khứ hồi · giữ field khác · token vắng → undefined · không mutate · re-sign-in: `null` khi không phải google / account null / thiếu access_token · bỏ key vắng (`refresh_token`, `id_token`, `expires_at`, `scope`) · chép `expires_at`, `scope` nguyên |
| P3 | Unit test `google/client.ts` (mock `@/server/db`, mock `googleapis` OAuth2 giả lưu handler `tokens`; crypto thật) | `src/server/google/client.test.ts` (mới) | `google-integrator` | không có account / `refresh_token` null → `GoogleNotConnectedError` · `setCredentials` nhận token đã giải mã + `expiry_date = expires_at*1000` · thiếu access/expiry → undefined · đăng ký listener `tokens` · sự kiện ghi access token mã hoá + `expires_at = floor(expiry/1000)` · chỉ ghi refresh_token / scope khi có · đúng `where` · lỗi DB log `userId` + message, không chứa token |
| P4 | Docs: mục "Đăng nhập giai đoạn 1" (tham số, vì sao `prompt=consent`, cách kiểm token `v1:`); thêm `google-tokens.ts` vào sơ đồ `auth/` | `docs/02-google-cloud.md`, `docs/04-architecture.md` | tự làm | — |
| Kiểm thật | Lệnh dùng một lần trên DB dev: `getGoogleAuth().getAccessToken()`, chờ sự kiện `tokens` ghi xong, in `expires_at` cũ/mới và cờ `v1:` (không in token) | không commit | người điều phối | — |

P1, P2, P3 khác file → làm song song. P4 sau P2. Kiểm thật sau P3 xanh.

Rủi ro / phụ thuộc:
- `server-only` đã alias trong `vitest.config.ts` → không cần mock; test không import `auth.ts` (nó gọi `NextAuth` và nạp prisma khi import) — lý do tách `google-tokens.ts`.
- Mock `googleapis`: factory trả `{ google: { auth: { OAuth2: FakeClass } } }`, class phải `new` được; handler `tokens` fire-and-forget → phải chờ promise trước khi assert.
- Kiểu `GOOGLE_AUTHORIZATION_PARAMS` phải khớp kiểu provider Google để typecheck qua.
- Kiểm thật cần đúng `TOKEN_ENCRYPTION_KEY` + client dev trong `.env.local`; refresh token có thể đã bị thu hồi (consent screen Testing: refresh token hết hạn sau 7 ngày) → khi đó cần người dùng đăng nhập lại ở `localhost:3000` rồi chạy lại.

Duyệt kế hoạch: ☐ chờ · ☑ người dùng đã duyệt (2026-11-26) · ☐ bỏ qua (`--yes`)

## 3. Thực hiện + kiểm thử

| Phần | Commit | Test thêm | typecheck | lint | test | build |
|---|---|---|---|---|---|---|
| P1 | `8fd07db` | `crypto.test.ts` 26 test | ✅ | ✅ | ✅ | ✅ |
| P2 | `25742e8` | `google-tokens.test.ts` 11 test | ✅ | ✅ | ✅ | ✅ |
| P3 | `84427fa` | `client.test.ts` 10 test | ✅ | ✅ | ✅ | ✅ |
| P4 | `1ef875b` | — (docs 02, 04) | — | — | — | — |

P1–P3 làm song song, verifier chạy một lần trên cả ba: typecheck, lint, build xanh; `npm test` 733/733.

**Kiểm thật refresh trên DB dev** (2026-11-26, lệnh dùng một lần qua `vite-node`, gọi `getGoogleAuth(userId).getAccessToken()` cho từng `Account` google; không in token):

| Tài khoản | `expires_at` trước | `expires_at` sau | Token mới | Ghi chú |
|---|---|---|---|---|
| #1 | 2026-11-26T15:25:03Z (đã hết hạn) | 2026-11-26T16:25:45Z | access + refresh `v1:` | refresh thành công, sự kiện `tokens` ghi DB |
| #2 | 2026-11-25T15:53:14Z (đã hết hạn) | 2026-11-26T16:25:44Z | access + refresh `v1:` | như trên |

Chạy lần hai: token còn hạn nên không refresh, `expires_at` giữ nguyên — đúng hành vi.

Ghi chú từ P1 (chưa sửa, đưa vào review): `encrypt("")` tạo payload mà `decrypt` từ chối (`!data`). Hiện không xảy ra vì `encryptOptional` đổi `""` thành `null`.

## 4. Review code

Reviewer đã chạy: `layer-reviewer`, `typescript-reviewer`, `security-reviewer` trên `git diff develop...HEAD` @ `da84ae9`. Không có CRITICAL / HIGH; cả ba xác nhận `auth.ts` giữ nguyên hành vi, không có đường token ra plaintext / log / client, test không chứa secret thật.

| # | Mức | File:dòng | Vấn đề | Reviewer |
|---|---|---|---|---|
| R1 | MEDIUM | `src/server/google/client.test.ts:190-211` | Test lỗi DB lấy args của `update` sau khi chỉ chờ `console.error` — phụ thuộc thứ tự bên trong `persistTokens` | typescript |
| R2 | LOW | `src/server/google/client.test.ts:195` | `expiry_date: 1` → `expires_at = 0`, giá trị vô nghĩa | typescript |
| R3 | LOW | `src/server/google/client.test.ts:73` | `restoreAllMocks` (afterEach) trùng `resetAllMocks` (beforeEach) | typescript |
| R4 | LOW | `src/server/auth/google-tokens.ts:16` | `Record<string, string>` mất kiểu literal; nên `as const satisfies Record<string, string>` | layer, typescript |
| R5 | LOW | `src/server/auth/google-tokens.ts:34` | `ReSignInTokenUpdate.access_token` kiểu `string \| null` dù sau guard luôn là string | typescript |
| R6 | LOW | `src/server/auth/auth.ts:18` | `adapter.linkAccount!` (có từ trước) + dòng > 100 ký tự | typescript |
| R7 | LOW | `src/server/auth/auth.ts:88`, `src/server/google/client.ts:43` | Log `error.message` của Prisma có thể chứa mảnh query (giá trị đã mã hoá) | security |
| R8 | LOW | `docs/02-google-cloud.md` | Lệnh kiểm tra nạp cả bản ghi `Account` (có token) rồi mới map; nên `select` chỉ field cần + ghi chú chỉ chạy trên dev | security |
| R9 | LOW | `src/server/crypto.ts` | Lỗi sai tag / sai khoá từ `decipher.final()` không được bọc thành lỗi thống nhất | security |
| R10 | LOW | `src/server/crypto.ts` | `encrypt("")` tạo payload mà `decrypt` từ chối (ghi chú từ P1) | P1 |
| R11 | LOW | `docs/tasks/T009-google-auth-verify.md:11` | Tiêu chí nghiệm thu chưa tick | layer |

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
