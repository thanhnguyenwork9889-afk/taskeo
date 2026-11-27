# T012 · Kết nối Drive ngay lúc đăng nhập + toggle Kết nối / Ngắt kết nối Drive

| | |
|---|---|
| Nhánh | `feat/T012-drive-connect-toggle` |
| Tạo từ | `develop` @ `6291f11` |
| Trạng thái | 6-rereview |
| Ngày tạo | 2026-11-27 |

Nguồn: người dùng đề nghị sau T011 (2026-11-27): kết nối Drive ngay khi đăng nhập, và nút Kết nối Drive ở sidebar hoạt động như toggle, tắt được. Không có dòng riêng trong sheet (liên quan sheet T30, đã xong ở T010).

## 1. Docs – yêu cầu

**Mục tiêu:** (1) Người dùng có thể cấp quyền Drive ngay trong lượt đăng nhập đầu, không phải bấm thêm. (2) Ở sidebar, trạng thái Drive là một công tắc: bật để kết nối, tắt để ngắt kết nối thật (thu hồi quyền ở Google), có xác nhận trước khi tắt.

**Hiện trạng (2026-11-27):**
- Trang đăng nhập (`src/app/(auth)/login/login-auth-panel.tsx`): form gọi `signInWithGoogle()` (không tham số), chỉ xin `openid email profile`.
- Sidebar (`src/components/layout/sidebar.tsx`): `driveStatus(viewer)` → `hidden` (demo) / `connect` (nút submit `connectGoogleDrive`) / `connected` (nhãn tĩnh). Không có cách ngắt kết nối.
- `connectGoogleDrive` + `buildIncrementalAuthorizationParams` (T010), `guardSignIn` (T011), `DriveNotice` + `?drive=` (T011) đã có.
- Google **không** cho thu hồi riêng một scope: gọi `https://oauth2.googleapis.com/revoke` với access hoặc refresh token sẽ huỷ toàn bộ quyền app có trên tài khoản đó (cả refresh token). Phiên Taskeo là phiên DB riêng nên không mất.

**Phạm vi:**
- **Trang đăng nhập:** ô tick "Kết nối Google Drive luôn" (mặc định **bật**) cạnh nút Đăng nhập bằng Google. `signInWithGoogle(formData)`: tick → `signIn("google", { redirectTo: "/" }, buildIncrementalAuthorizationParams([drive]))`; không tick → như cũ. Giá trị form chỉ nhận đúng `"on"`; mọi giá trị khác coi là không tick.
- **Server action `disconnectGoogleDrive(formData)`** (`src/server/auth/actions.ts`): demo / misconfigured → `/`; chưa đăng nhập → `/login`; đọc Account google của user (cùng thứ tự `GOOGLE_ACCOUNT_ORDER`), gọi Google revoke (ưu tiên refresh token, không có thì access token; giải mã trước khi gửi, không log token); thu hồi thành công **hoặc** Google báo token đã không còn hợp lệ (`invalid_token`) → cập nhật Account: `access_token = null`, `refresh_token = null`, `expires_at = null`, `scope` = scope đăng nhập (bỏ mọi scope Google API); lỗi khác (mạng, 5xx) → không đổi DB. Sau đó chuyển về trang hiện tại (`redirectTo` qua `toSafeRedirectPath`) kèm `?drive=disconnected` hoặc `?drive=disconnect-failed`.
- **Hàm thuần** đi kèm (có test): chọn token để thu hồi, phân loại kết quả thu hồi (thành công / đã hết hiệu lực / lỗi), dựng dữ liệu cập nhật Account sau khi ngắt.
- **Sidebar:** thay nút / nhãn Drive bằng công tắc (`role="switch"`, `aria-checked`, dùng được bằng bàn phím, có nhãn "Google Drive"). Tắt → bật: submit `connectGoogleDrive` như hiện nay. Bật → tắt: mở hộp xác nhận (dùng modal có sẵn ở `components/ui`) với nội dung nói rõ: thu hồi **mọi** quyền Google của Taskeo trên tài khoản này (Drive, và Calendar khi có), vẫn đăng nhập Taskeo, bật lại sẽ phải đồng ý lại với Google; xác nhận → submit `disconnectGoogleDrive`. Demo: không hiện công tắc.
- **Thông báo:** `DriveNotice` thêm `disconnected` ("Đã ngắt kết nối Google Drive.") và `disconnect-failed` ("Không ngắt kết nối được Google Drive. Hãy thử lại.").
- Docs: 02 (đăng nhập kèm Drive, ngắt kết nối, giới hạn thu hồi theo tài khoản), 04 (file mới).

**Ngoài phạm vi:**
- Thu hồi riêng scope Drive (Google không hỗ trợ); tắt chỉ ở phía app mà không thu hồi ở Google.
- Calendar (T37) — chỉ nhắc trong nội dung xác nhận.
- Xoá dữ liệu Drive / thư mục đã tạo (T31 chưa có).
- Trang cài đặt tài khoản riêng.

**Tiêu chí nghiệm thu** (mỗi dòng kiểm tra được):
- [ ] Test: `signInWithGoogle` với `connectDrive=on` gửi `scope` có `drive.file` + `offline` / `consent` / `include_granted_scopes`; không có hoặc giá trị khác → tham số đăng nhập cũ; demo / misconfigured không gọi `signIn`.
- [ ] Test hàm thuần: chọn refresh token trước access token, không có token → không gọi Google; `invalid_token` coi là đã thu hồi; lỗi mạng / 5xx là lỗi; dữ liệu cập nhật xoá 3 trường token, `scope` chỉ còn scope đăng nhập.
- [ ] Test `disconnectGoogleDrive`: demo / misconfigured → `/`; chưa đăng nhập → `/login`; thu hồi thành công → DB cập nhật đúng, chuyển về trang cũ kèm `drive=disconnected`; lỗi → DB không đổi, `drive=disconnect-failed`; token không xuất hiện trong log; `redirectTo` ngoài → `/`.
- [ ] Sidebar: công tắc có `role="switch"` + `aria-checked` đúng trạng thái, bấm bằng bàn phím được; tắt có hộp xác nhận, huỷ thì không làm gì; demo không hiện (kiểm trong trình duyệt + test hàm thuần nếu có).
- [ ] Trang đăng nhập có ô tick, mặc định bật, có nhãn bấm được.
- [ ] Kiểm thật trên dev cùng người dùng: đăng nhập có tick → `Account.scope` có `drive.file`; tắt công tắc → Google thu hồi (thử gọi Drive API thất bại), DB không còn token, sidebar về "tắt", vẫn đăng nhập; bật lại → kết nối lại được.
- [ ] 4 lệnh typecheck / lint / test / build xanh; chế độ demo không đổi.
- [ ] Docs 02, 04 cập nhật.

**Tài liệu bị ảnh hưởng:** 02 Google · 04 kiến trúc.

## 2. Kế hoạch từng phần

Kết quả kiểm tra của planner (đọc `node_modules`):
- **Thu hồi bằng `fetch`, không dùng `OAuth2Client.revokeToken`:** thư viện gắn token vào query string và có retry; lỗi gaxios mang `config.url` → token dễ lọt vào log. Dùng `POST https://oauth2.googleapis.com/revoke`, body form `token=…`, `AbortSignal.timeout(~10 s)`, `fetchImpl` truyền vào để test. Phân loại: 200 → `revoked`; 400 + `error: "invalid_token"` → `already-invalid`; còn lại (400 khác, 5xx, JSON hỏng, fetch ném lỗi, timeout) → `failed`. Log chỉ `status` / `error.name`.
- **Scope sau khi ngắt:** hằng mới trong `scopes.ts` đúng dạng Google lưu: `openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile` (không dùng `"openid email profile"` của tham số request). Hệ quả có sẵn: `driveConnected` = false; `getGoogleAuth` gặp `refresh_token` null → `GoogleNotConnectedError`; kết nối lại → `buildReSignInTokenUpdate` ghi token + scope mới. Giữ `id_token`.
- **Modal:** dùng `components/ui/modal.tsx` (đã có giữ focus, Esc, trả focus). `<aside>` có `translate-x-*` → phần tử `fixed` bị nhốt trong sidebar → render qua `createPortal(…, document.body)`.
- **Trang đăng nhập:** không cần client component; checkbox `name="connectDrive" value="on" defaultChecked` trong form server action. `signInWithGoogle` chỉ có một chỗ gọi.
- **Chuyển hướng:** hàm thuần `withQueryParam(path, key, value)` (qua `toSafeRedirectPath`, giữ query khác + hash, thay `drive` cũ); `redirect()` ngoài mọi try/catch; `refresh()` của `next/cache` trước redirect nếu sidebar không tự cập nhật (xác nhận ở P9).

Quyết định cho hai trường hợp spec chưa nói (đề xuất của planner, người dùng duyệt cùng kế hoạch): Account google **không còn token nào** → không gọi Google, vẫn ghi dữ liệu đã ngắt, báo `disconnected`; **không có dòng Account google** → báo `disconnect-failed`, không ghi gì.

| Phần | Việc | File | Agent | Test cần viết |
|---|---|---|---|---|
| P1 | Hằng scope đăng nhập; `selectRevokeToken(account)` (refresh trước access, không có → null), `classifyRevokeResponse(status, body)`, `revokeGoogleToken(token, fetchImpl)` (POST form, timeout, mọi lỗi → `failed`, không log token), `buildDisconnectedAccountUpdate()` | `src/server/google/scopes.ts`, `src/server/google/revoke.ts` (mới) + test | `google-integrator` | hằng không chứa scope API · chọn token · 200 / 400 invalid_token / 400 khác / 500 / JSON hỏng / fetch ném / timeout · token ở body không ở URL · console không chứa token · dữ liệu cập nhật đúng |
| P2 | `withQueryParam(path, key, value)` | `src/server/auth/redirect-path.ts` + test | `google-integrator` | `/` → `/?drive=x` · giữ query sẵn có · thay `drive` cũ · giữ hash · URL ngoài → `/?drive=x` |
| P3 | `signInWithGoogle(formData)`: chỉ `connectDrive === "on"` mới truyền `buildIncrementalAuthorizationParams([drive])` | `src/server/auth/actions.ts` + test | `google-integrator` | `on` → scope có drive.file + offline / consent / include_granted_scopes · vắng / `"true"` / `"ON"` → tham số cũ · demo / misconfigured không gọi `signIn` |
| P4 | `disconnectGoogleDrive(formData)`: `getApiUserId` → `/` hoặc `/login`; `account.findFirst` theo `GOOGLE_ACCOUNT_ORDER`; giải mã; thu hồi; `revoked` / `already-invalid` / không token → `update`; `refresh()`; `redirect(withQueryParam(...))`. Import động `prisma` / `revoke` | `src/server/auth/actions.ts` + test | `google-integrator` | demo → `/` · 401 → `/login` · thành công / already-invalid / không token → update đúng, `drive=disconnected` · lỗi → không update, `drive=disconnect-failed` · không có Account → failed · giải mã lỗi → failed · `redirectTo` ngoài → `/?drive=…` · console không có token |
| P5 | `DRIVE_NOTICES` thêm `disconnected`, `disconnect-failed` | `src/components/layout/drive-notice.ts` + test | `feature-builder` | 2 mã mới trả đúng câu |
| P6 | Công tắc Drive (`role="switch"`, `aria-checked`; tắt → form `connectGoogleDrive`; bật → mở modal) + modal xác nhận qua portal + nút có trạng thái đang gửi (`useFormStatus`); `currentLocation(pathname, search)` dùng chung; bỏ `ConnectDriveForm` | `src/components/layout/drive-switch.tsx` (mới), `sidebar.tsx`, `drive-status.ts` + test | `feature-builder` | `currentLocation` có / không query; `driveStatus` giữ nguyên. A11y kiểm trong trình duyệt |
| P7 | Ô tick "Kết nối Google Drive luôn", mặc định bật, nhãn bấm được | `src/app/(auth)/login/login-auth-panel.tsx` | `feature-builder` (chỉ UI; logic đọc ô tick ở P3) | Kiểm trong trình duyệt |
| P8 | Docs 02 (đăng nhập kèm Drive, ngắt kết nối, thu hồi theo cả tài khoản, mã `?drive=`), 04 (`revoke.ts`, `drive-switch.tsx`) | `docs/02-google-cloud.md`, `docs/04-architecture.md` | tự làm | — |
| P9 | Kiểm thật trên dev cùng người dùng: đăng nhập có tick → `drive.file`; tắt → huỷ thì không đổi; xác nhận → thông báo, DB không còn token, scope chỉ còn đăng nhập, gọi Drive API thất bại, vẫn đăng nhập; bật lại → đồng ý lại → kết nối; đăng nhập không tick → như cũ; demo không có công tắc | không commit | tự làm + người dùng | — |

Thứ tự: đợt 1 P1 ∥ P2 ∥ P5 → đợt 2 P3 → P4 (cùng `actions.ts`) → đợt 3 P6 ∥ P7 → P8 → 4 lệnh → P9.

Rủi ro / phụ thuộc:
- Modal bị nhốt trong sidebar vì `translate` → portal; vẫn lỗi thì đưa state modal lên `AppShell` qua `UIContext`.
- Lộ token: không dùng `revokeToken` của thư viện, không log `error.message` của fetch, test spy console; security-reviewer xem kỹ P1, P4.
- Ghi đè đồng thời: request khác đang refresh token có thể ghi token lại ngay sau khi ngắt (listener `"tokens"`). Chưa có tính năng nào gọi Drive API (T31 chưa làm) → rủi ro thấp; để sau.
- Thu hồi xoá mọi quyền của app trên tài khoản Google đó, cả ở thiết bị khác — modal phải nói rõ.
- Chuỗi `?drive=` lặp ở hai lớp, giữ khớp bằng test (như T011).
- P9 cần người dùng; bước "gọi Drive API thất bại" có thể kiểm bằng lệnh dùng một lần (như T010).

Duyệt kế hoạch: ☐ chờ · ☑ người dùng đã duyệt (2026-11-27) · ☐ bỏ qua (`--yes`)

## 3. Thực hiện + kiểm thử

| Phần | Commit | Test thêm | typecheck | lint | test | build |
|---|---|---|---|---|---|---|
| P1 | `3cf07d9` | `scopes.test.ts` + `revoke.test.ts` (61 test trong `src/server/google`; spy cả 5 hàm console, token không xuất hiện) | ✅ | ✅ | ✅ 893/893 | ✅ |
| P2 | `4ab4ccd` | 22 test (`redirect-path.test.ts`) | ✅ | ✅ | ✅ 893/893 | ✅ |
| P5 | `71d6150` | 16 test (`drive-notice.test.ts`) | ✅ | ✅ | ✅ 893/893 | ✅ |
| P3+P4 | `d76c7d8` | 27 test mới trong `actions.test.ts` (143/143 trong `src/server/auth`; spy 5 hàm console ở 4 kịch bản, không chứa token) | ✅ | ✅ | ✅ 920/920 | ✅ |
| P7 | `5935783` | — (trình duyệt: `/login` có ô tick mặc định bật, nhãn + mô tả, console sạch) | ✅ | ✅ | ✅ 920/920 | ✅ |
| P6 | `07b3a25` | 4 test `currentLocation` (`drive-status.test.ts`); UI chưa xem được vì pane mất phiên — gộp vào P9 | ✅ | ✅ | ✅ 924/924 | ✅ |
| P8 | (commit docs này) | — (docs 02: ô tick đăng nhập, công tắc, mục "Ngắt kết nối Drive", mã `?drive=`; docs 04: `revoke.ts`, `drive-switch.tsx`, `withQueryParam`) | — | — | — | — |
| P9 | không commit (kiểm thật) | — | ✅ | ✅ | ✅ 924/924 | ✅ |

Ghi chú P1: `selectRevokeToken` trả token **đã mã hoá** (đúng cột DB), P4 giải mã ngay trước khi gọi; 200 trả `revoked` không đọc body. Ghi chú P2: `toSafeRedirectPath` cho qua `/.//evil`, `/a/..//evil`, `/%2e//evil`, sau `new URL` thành `//evil`; `withQueryParam` chặn bằng cách kiểm kết quả không bắt đầu bằng `//` (có test). `toSafeRedirectPath` chưa sửa — đưa vào review.

Ghi chú P3+P4: cùng file `actions.ts` nên commit chung. Lỗi khi ghi DB sau khi thu hồi → `disconnect-failed` (log `{ userId, error: name }`): bấm lại thì Google trả `invalid_token` → ghi lại được. Lỗi đọc Account (`findFirst`) vẫn lan ra trang lỗi.

**Kiểm thật trên DB dev** (2026-11-27; người dùng thao tác ở `localhost:3000` rồi báo đã xong; lệnh dùng một lần qua `vite-node`, không commit, không in token):

| Kiểm | Kết quả |
|---|---|
| `Account` / `User` | vẫn 2 / 2, không có dòng mới |
| `…pmwenu` (tài khoản người dùng thử công tắc) | token cấp lại lúc 01:11Z (đồng ý lại với Google), `scope` có `drive.file`, access + refresh `v1:` |
| Gọi Drive API (`files.list`) bằng token hiện tại | cả hai tài khoản thành công |

- DB chỉ giữ trạng thái cuối nên bước "ngắt kết nối" (token = null, scope chỉ còn đăng nhập) không còn dấu vết sau khi bật lại; kết quả bước đó dựa trên báo cáo của người dùng + test của P4 / P1.
- Chưa thấy dấu vết bước "đăng nhập không tick" (không có phiên mới chỉ với scope đăng nhập); hành vi có test ở P3.
- Hộp xác nhận (portal) và công tắc: người dùng đã dùng thật; Claude chưa xem tận mắt vì pane mất phiên.

## 4. Review code

Reviewer đã chạy: `layer-reviewer`, `typescript-reviewer`, `security-reviewer` trên `git diff develop...HEAD` @ `c069ff5`. Không có CRITICAL. Đã xác nhận: token chỉ trong body form, log chỉ status / `error.name`, URL thu hồi cố định (không SSRF); `disconnectGoogleDrive` xác thực trước, truy vấn / update theo `userId` (không IDOR); `redirect()` ngoài try/catch; CSRF do Next kiểm Origin; `withQueryParam` chặn `//` sau chuẩn hoá; ranh giới lớp đúng.

| # | Mức | File:dòng | Vấn đề | Reviewer |
|---|---|---|---|---|
| R1 | HIGH | `src/components/layout/drive-switch.tsx` (state `confirming`), `sidebar.tsx` (`key={drive}`) | Ngắt kết nối thất bại → `drive` vẫn `connected`, component không dựng lại, `confirming` vẫn true → hộp xác nhận vẫn mở, thông báo `disconnect-failed` nằm sau lớp phủ | typescript (HIGH), layer (MEDIUM) |
| R2 | HIGH (a11y) | `src/components/ui/modal.tsx` focus ban đầu + `FOCUSABLE` | `querySelector("input, …")` chọn `<input type="hidden">` → `.focus()` không có tác dụng, focus ở lại công tắc phía sau, Tab có thể thoát khỏi hộp; `FOCUSABLE` cũng gom input ẩn | typescript |
| R3 | MEDIUM | `src/server/auth/redirect-path.ts` `toSafeRedirectPath` | Cho qua `/.//evil`, `/..//evil`, `/%2e%2e//evil` (sau `new URL` thành `//evil`). Hiện chưa khai thác được (Auth.js ghép `baseUrl + url`, cùng origin; `withQueryParam` đã chặn) nhưng nên chuẩn hoá tại gốc | security |
| R4 | MEDIUM | `src/server/auth/actions.ts` nhánh `decrypt` lỗi | Token không giải mã được (đổi khoá, dữ liệu hỏng) → luôn `false`, người dùng không bao giờ ngắt kết nối được | security, typescript |
| R5 | MEDIUM | `actions.ts` `revokeAndClearGoogleTokens` | JSDoc nói "không ném" nhưng `import()` + `findFirst` nằm ngoài try/catch → lỗi DB đọc ra trang lỗi | typescript |
| R6 | MEDIUM | `modal.tsx` + `drive-switch.tsx` | Đang gửi (`pending`) vẫn đóng được bằng Esc / bấm ngoài / X / Huỷ; request vẫn chạy rồi chuyển trang | typescript |
| R7 | LOW | `src/server/google/scopes.ts` | Định dạng `GoogleScope =(typeof …` | layer, security, typescript |
| R8 | LOW | `drive-switch.tsx` `SwitchRow` | `aria-label` ghi đè chữ trạng thái ("Đã kết nối", "Đang chuyển tới Google…") | typescript |
| R9 | LOW | `src/server/google/revoke.ts` nhánh 200 | Không đọc / huỷ body phản hồi | typescript |
| R10 | LOW | `actions.ts`, `revoke.ts` | `errorName` lặp; `return;` thay được bằng `else` | typescript |
| R11 | LOW | `actions.ts` `disconnectGoogleDrive` | Không giới hạn tần suất (đã bắt buộc phiên) | security |
| R12 | LOW | `src/server/auth/auth.ts` `persistReSignInTokens` (có từ trước) | Log `error.message` của Prisma, có thể chứa dữ liệu truy vấn (token đã mã hoá) | security |
| R13 | LOW | `drive-switch.tsx` | Chuỗi tiếng Việt viết thẳng trong component | layer |
| R14 | LOW | `actions.ts` | Chỉ thu hồi Account google đầu tiên; chấp nhận vì T011 bảo đảm một Account google mỗi user | typescript |

## 5. Fix bug

Commit trước bước 5: `349c6c2`.

| Phát hiện | Xử lý | Commit |
|---|---|---|
| R1 | đã sửa: form `disconnectGoogleDrive` bọc cả `Modal`; `useCloseWhenSettled(pending, onClose)` đóng hộp khi `pending` chuyển true → false (thành công hay thất bại) | `d7396d8` |
| R2 | đã sửa: `Modal` bỏ qua input ẩn / phần tử disabled khi chọn focus và giữ Tab; prop `initialFocusRef` — hộp ngắt kết nối focus nút "Huỷ" trước; không còn phần tử focus được thì chặn Tab | `d7396d8` |
| R3 | đã sửa: `toSafeRedirectPath` chuẩn hoá bằng `new URL(path, "http://internal")` (origin khác hoặc pathname `//` → `/`); test `/.//evil`, `/..//evil`, `/%2e%2e//evil`, `/a/../b` → `/b`… `withQueryParam` giữ guard `//` làm lớp thêm | `d7396d8` |
| R4 | đã sửa: token không giải mã được → không gọi Google, vẫn xoá token khỏi DB, báo `disconnected`; JSDoc + docs: token đó không thu hồi được ở Google, người dùng tự gỡ quyền ở trang tài khoản Google | `d7396d8` |
| R5 | đã sửa: `loadGoogleAccount` bọc `import()` + `findFirst`; lỗi → `disconnect-failed`, log `{ userId, error: name }` | `d7396d8` |
| R6 | đã sửa: `Modal` prop `dismissible` (mặc định `true`); hộp ngắt kết nối `dismissible={!pending}`, nút Huỷ / Ngắt kết nối / X disabled khi đang gửi | `d7396d8` |
| R7 | đã sửa: định dạng `GoogleScope = (typeof …` | `d7396d8` |
| R8 | đã sửa: công tắc dùng `aria-labelledby` (tên) + `aria-describedby` (trạng thái), id bằng `useId` | `d7396d8` |
| R9 | đã sửa: nhánh 200 huỷ body (`response.body?.cancel()`, lỗi bỏ qua) | `d7396d8` |
| R10 | để sau (LOW): gom `errorName` khi có nơi thứ ba cần | — |
| R11 | chấp nhận: action bắt buộc phiên; Account không còn token thì không gọi Google; rate limit chung ở sheet T73 | — |
| R12 | đã sửa: `persistReSignInTokens` chỉ log `error.name` | `d7396d8` |
| R13 | để sau (LOW): gom nhãn UI khi có file nhãn chung | — |
| R14 | chấp nhận: T011 bảo đảm một Account google mỗi user | — |

Kết quả 4 lệnh sau khi sửa (tự chạy): typecheck ✅ · lint ✅ · test ✅ 936/936 · build ✅.

## 6. Review lại

Vòng 1 (`git diff 349c6c2..HEAD`, cùng ba reviewer): không có CRITICAL / HIGH. Xác nhận R1–R9, R12 đúng; 6 dialog khác dùng `Modal` giữ hành vi cũ. Phát hiện mới:

| # | Mức | Vấn đề | Xử lý |
|---|---|---|---|
| R15 | MEDIUM | Token không giải mã được → xoá DB nhưng báo `disconnected`, người dùng không biết quyền ở Google còn (layer, security) | sửa ở vòng 2: mã riêng `disconnected-local` + câu hướng dẫn gỡ quyền ở trang tài khoản Google |
| R16 | MEDIUM | `confirming` vẫn true sau khi ngắt thành công (typescript) | bỏ qua: không tái hiện được — sidebar render `<DriveSwitch key={drive}>`, đổi `connected` → `connect` làm React dựng lại component, `confirming` về `false` |
| R17 | LOW | Đang gửi: nút Huỷ disabled → focus rơi về `body` (layer, security, typescript) | để sau: `trapTab` đã chặn Tab không thoát hộp |
| R18 | LOW | `decrypt` trả chuỗi rỗng bị coi như không có token | chấp nhận: nhất quán với R4 |
| R19 | LOW | `discardBody`, log của `auth.ts` chưa có test riêng; `toSafeRedirectPath` chuẩn hoá đổi `/a?` → `/a` | để sau / chấp nhận |

## 7. Final

**Tóm tắt:**

**Tiêu chí nghiệm thu:** (đánh dấu ở mục 1)

**Tài liệu đã cập nhật:**

**Merge vào develop:** commit `<hash>`, ngày

**Việc để sau:**
-
