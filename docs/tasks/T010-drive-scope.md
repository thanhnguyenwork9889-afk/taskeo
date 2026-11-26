# T010 · Thêm scope `drive.file` (xin quyền theo từng bước)

| | |
|---|---|
| Nhánh | `feat/T010-drive-scope` |
| Tạo từ | `develop` @ `94d53e9` |
| Trạng thái | 3-build |
| Ngày tạo | 2026-11-26 |

Nguồn: sheet nhiệm vụ, dòng **T30** "Thêm scope drive.file (xin quyền theo từng bước)" (giai đoạn 4 · Google Drive, backlog B5 phần đầu). Mở ra khi bắt đầu T33: T33 phụ thuộc T31, T31 phụ thuộc T30; người dùng chọn làm T30 → T31 trước, mỗi mục sheet một nhiệm vụ riêng.

## 1. Docs – yêu cầu

**Mục tiêu:** Người dùng đã đăng nhập có thể cấp thêm quyền Google Drive (`drive.file`) ngay trong app, không phải đăng xuất. Server biết user đã có quyền đó hay chưa, để các nhiệm vụ Drive sau (T31 tạo thư mục, T32, T33, T34) dựa vào.

**Hiện trạng (kiểm tra 2026-11-26):**
- `src/server/google/scopes.ts` đã khai báo `GOOGLE_SCOPES.drive` và `hasScope(granted, scope)` nhưng chưa nơi nào dùng.
- Đăng nhập chỉ xin `openid email profile` (`GOOGLE_AUTHORIZATION_PARAMS` trong `src/server/auth/google-tokens.ts`), có sẵn `include_granted_scopes=true`, `prompt=consent`, `access_type=offline`.
- Đăng nhập lại: `events.signIn` → `buildReSignInTokenUpdate` đã ghi `Account.scope` mới khi Google trả về → xin thêm scope bằng một lượt đăng nhập lại sẽ cập nhật DB mà không cần sửa adapter.
- Server action duy nhất là `signInWithGoogle` / `signOutAction` (`src/server/auth/actions.ts`). `Viewer` (`session.ts`) chỉ có name / email / image / isDemo.
- UI vẫn chạy store demo (T59 chưa làm).

**Phạm vi:**
- Hàm thuần dựng tham số ủy quyền khi xin thêm scope: giữ `access_type`, `prompt`, `include_granted_scopes` như đăng nhập, `scope` = scope đăng nhập + scope cần thêm.
- Server action `connectGoogleDrive()`: chỉ chạy ở chế độ `configured` và khi đã đăng nhập; gọi `signIn("google", { redirectTo }, <tham số trên với drive.file>)`; `redirectTo` chỉ cho phép đường dẫn nội bộ (bắt đầu bằng `/`, không `//`), mặc định trang hiện tại hoặc `/`.
- Hàm server đọc quyền đã cấp của user: `getGrantedGoogleScopes(userId)` / `hasGoogleScope(userId, scope)` (đọc `Account.scope`, dùng `hasScope`), và lỗi `GoogleScopeMissingError` + `requireGoogleScope(userId, scope)` để T31 dùng.
- Cho UI biết trạng thái: `Viewer` có thêm `driveConnected: boolean` (demo: `false`), lấy cùng lượt `getViewer()`.
- UI: ở sidebar (chỗ "Đã đăng nhập Google") hiện nút **Kết nối Google Drive** khi đã đăng nhập thật và `driveConnected = false`; đã cấp thì hiện "Đã kết nối Google Drive". Chế độ demo không hiện nút.
- Trường hợp người dùng bỏ tick ô Drive ở màn đồng ý (granular consent): `Account.scope` không có `drive.file` → nút vẫn hiện, không lỗi.
- Docs: `02-google-cloud.md` (cách xin thêm scope, việc thêm `drive.file` vào consent screen), `04-architecture.md`.

**Ngoài phạm vi:**
- Tạo thư mục Drive khi tạo không gian / dự án (T31), tạo file (T32), liệt kê file (T33), Picker (T34), dung lượng Drive (T35).
- Calendar scope (T37).
- Thu hồi quyền / ngắt kết nối Drive trong app; xử lý token bị thu hồi trên giao diện (T47).
- Thêm scope trên Google Cloud Console: **người dùng tự làm** (ghi hướng dẫn ở docs 02).

**Tiêu chí nghiệm thu** (mỗi dòng kiểm tra được):
- [ ] Test: tham số xin thêm scope có `scope` = `openid email profile https://www.googleapis.com/auth/drive.file`, cùng `access_type: "offline"`, `prompt: "consent"`, `include_granted_scopes: "true"`; không trùng scope khi gọi lại; đăng nhập thường vẫn chỉ `openid email profile`.
- [ ] Test: `connectGoogleDrive` ở demo / misconfigured không gọi `signIn`; chưa đăng nhập → về `/login`; `redirectTo` ngoài (`https://…`, `//evil`) bị thay bằng `/`.
- [ ] Test: `hasGoogleScope` trả `true` khi `Account.scope` có `drive.file`, `false` khi thiếu, khi `scope` null, khi không có account; `requireGoogleScope` ném `GoogleScopeMissingError` khi thiếu. Truy vấn luôn lọc theo `userId`.
- [ ] Test: `getViewer` trả `driveConnected` đúng theo scope; demo → `false`; không đưa chuỗi scope hay token ra client.
- [ ] Sidebar hiện nút Kết nối Google Drive khi chưa cấp, nhãn đã kết nối khi đã cấp, không hiện ở demo (kiểm tay hoặc test component).
- [ ] Chạy thật trên dev (cần người dùng bấm đồng ý ở `localhost:3000`): sau khi cấp, `Account.scope` trong DB dev có `drive.file`, token vẫn `v1:`, refresh token còn dùng được.
- [ ] 4 lệnh typecheck / lint / test / build xanh; chế độ demo vẫn chạy.
- [ ] `docs/02-google-cloud.md`, `docs/04-architecture.md` cập nhật.

**Tài liệu bị ảnh hưởng:** 02 Google · 04 kiến trúc.

## 2. Kế hoạch từng phần

Kết quả kiểm tra của planner (đọc `node_modules`):
- `signIn(provider, options, authorizationParams)` đưa tham số thứ ba vào query; `@auth/core` gộp `{...provider.authorization.params, ...query}` → `scope` truyền vào **thay hẳn** scope đăng nhập, nên phải gộp `openid email profile` + `drive.file`; các key không truyền giữ giá trị provider.
- Đăng nhập lại khi đang có phiên, cùng tài khoản Google: `isNewUser = false`, `events.signIn` vẫn chạy → `buildReSignInTokenUpdate` ghi `scope` mới. Không cần sửa adapter.
- Chọn **tài khoản Google khác** ở màn chọn tài khoản: Auth.js `linkAccount` tài khoản đó vào user hiện tại → một user hai dòng Account google. Giảm bằng `login_hint` = email trong phiên.
- `session.user.id` có sẵn; `driveConnected` đọc trong `getViewer()` qua import động, chỉ trả boolean (không đưa scope vào session callback vì lộ qua `/api/auth/session`).
- File `"use server"` chỉ export hàm async → `toSafeRedirectPath`, `GoogleScopeMissingError` đặt ở file khác.

| Phần | Việc | File | Agent | Test cần viết |
|---|---|---|---|---|
| P1 | Hàm thuần `buildIncrementalAuthorizationParams(extra: readonly GoogleScope[])`: giữ `access_type`, `prompt`, `include_granted_scopes`; `scope` = scope đăng nhập + scope thêm, bỏ trùng, không mutate; `GOOGLE_AUTHORIZATION_PARAMS` giữ nguyên | `src/server/auth/google-tokens.ts`, `google-tokens.test.ts` | `google-integrator` | scope đúng chuỗi `openid email profile …/drive.file` · 3 tham số kia đúng · truyền trùng / gọi lặp không trùng · hằng số đăng nhập không đổi |
| P2 | `getGrantedGoogleScopes(userId)`, `hasGoogleScope(userId, scope)`, `GoogleScopeMissingError(scope)`, `requireGoogleScope(userId, scope)`; `scopes.ts` giữ thuần | `src/server/google/granted-scopes.ts` + `.test.ts` (mock `@/server/db`) | `google-integrator` | có drive → true · thiếu / `scope` null / không account → false (và `[]`) · `require` ném đúng lỗi kèm tên scope · `findFirst` với `where: { userId, provider: "google" }`, `select: { scope: true }` |
| P3 | `toSafeRedirectPath(value: unknown)` (string, bắt đầu `/`, không `//` hay `/\`, không `\` / ký tự điều khiển, ≤ 2048, ngược lại `/`) + server action `connectGoogleDrive(formData)`: `getApiUserId()` → 503 `redirect("/")`, 401 `redirect("/login")` → `signIn("google", { redirectTo }, { ...buildIncrementalAuthorizationParams([drive]), login_hint: <email phiên nếu có> })` | `src/server/auth/redirect-path.ts` + `.test.ts`; `src/server/auth/actions.ts` + `actions.test.ts` (mới) | `google-integrator` | redirect-path: đường nội bộ giữ nguyên; `https://…`, `//…`, `/\…`, xuống dòng, rỗng, null, không phải string, quá dài → `/` · action: demo / misconfigured không gọi `signIn`; chưa đăng nhập → `/login`; redirectTo ngoài → `/`; tham số thứ ba có drive.file + 3 tham số + `login_hint` |
| P4 | `Viewer.driveConnected` (demo false; configured: `hasGoogleScope` qua import động; thiếu `user.id` → false; lỗi DB lan ra như `auth()`); sửa `toEqual` cũ ở `session.test.ts` | `src/server/auth/session.ts`, `session.test.ts` | `google-integrator` | demo → false, không import granted-scopes · có / không scope → true / false · đúng userId · kết quả chỉ 5 key, không scope / token · chưa đăng nhập → null, không truy vấn |
| P5 | `ViewerInfo.driveConnected` + `SIGNED_OUT`; hàm thuần `driveStatus(viewer)` → `hidden` / `connect` / `connected`; sidebar: dưới "Đã đăng nhập Google" có form nút **Kết nối Google Drive** (hidden `redirectTo` = pathname + search) hoặc nhãn "Đã kết nối Google Drive"; demo không hiện | `src/components/layout/ui-context.tsx`, `sidebar.tsx`, `drive-status.ts` + `.test.ts` | `feature-builder` | `driveStatus`: demo → hidden · thật + false → connect · thật + true → connected. UI kiểm tay (chưa có hạ tầng test component) |
| P6 | Docs: 02 (thêm drive.file ở Data Access của consent screen, luồng xin thêm scope, granular consent, cảnh báo chọn nhầm tài khoản); 04 (cây thư mục) | `docs/02-google-cloud.md`, `docs/04-architecture.md` | tự làm | — |
| P7 | Kiểm thật trên dev cùng người dùng: bấm kết nối, đồng ý → `Account.scope` có drive.file, token `v1:`, refresh còn dùng được (cách kiểm của T009); thử bỏ tick Drive; demo vẫn chạy | không commit | tự làm + người dùng | — |

Thứ tự: đợt 1 P1 ∥ P2 → đợt 2 P3 (cần P1) ∥ P4 (cần P2) → đợt 3 P5 (cần P3, P4) ∥ P6 → P7.

Rủi ro / phụ thuộc:
- **Người dùng tự làm trước P7:** Google Cloud Console → OAuth consent screen → Data Access → thêm `…/auth/drive.file` (đối chiếu phân loại scope); tài khoản phải là test user; rồi bấm đồng ý ở `localhost:3000`.
- Chọn nhầm tài khoản Google → hai Account google cho một user, `findFirst` không xác định. `login_hint` chỉ giảm, không chặn; chặn hẳn (callbacks.signIn từ chối providerAccountId khác) để nhiệm vụ sau.
- `getViewer` thêm một truy vấn nhẹ mỗi lần render layout — chấp nhận.
- Test server action: mock `redirect` ném lỗi, dùng `rejects`.

Duyệt kế hoạch: ☐ chờ · ☑ người dùng đã duyệt (2026-11-26) · ☐ bỏ qua (`--yes`)

## 3. Thực hiện + kiểm thử

| Phần | Commit | Test thêm | typecheck | lint | test | build |
|---|---|---|---|---|---|---|
| P1 | `ed198b1` | 7 test (`google-tokens.test.ts`) | ✅ | ✅ | ✅ 754/754 | ✅ |
| P2 | `105ed47` | 14 test (`granted-scopes.test.ts`) | ✅ | ✅ | ✅ 754/754 | ✅ |
| P3 | `1a48ced` | 21 test (`redirect-path.test.ts`) + 8 test (`actions.test.ts`) | ✅ | ✅ | ✅ 788/788 | ✅ |
| P4 | `744486f` | 5 test mới + 3 test sửa (`session.test.ts`) | ✅ | ✅ | ✅ 788/788 | ✅ |
| P5 | `e11278c` | 3 test (`drive-status.test.ts`); UI kiểm trong trình duyệt ở `localhost:3000` khi đã đăng nhập: nút hiện ở đáy sidebar, console sạch | ✅ | ✅ | ✅ 791/791 | ✅ |
| P6 | (commit docs này) | — (docs 02: mục "Xin thêm `drive.file`"; docs 04: cây thư mục) | — | — | — | — |
| P7 | chờ người dùng | — | | | | |

P3, P4, P5 do Claude tự viết trong phiên (người dùng đồng ý 2026-11-26) vì công cụ giao agent lỗi kiểm tra chế độ auto ba lần; 4 lệnh cũng tự chạy thay `verifier`.

## 4. Review code

Reviewer đã chạy:

| # | Mức | File:dòng | Vấn đề | Reviewer |
|---|---|---|---|---|
| R1 | | | | |

## 5. Fix bug

| Phát hiện | Xử lý | Commit |
|---|---|---|
| R1 | | |

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
