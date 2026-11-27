# T013 · Tạo thư mục Google Drive khi tạo không gian / dự án

| | |
|---|---|
| Nhánh | `feat/T013-drive-folders` |
| Tạo từ | `develop` @ `0c0ce60` |
| Trạng thái | done |
| Ngày tạo | 2026-11-27 |

Nguồn: sheet nhiệm vụ, dòng **T31** "tạo thư mục Drive khi tạo không gian / dự án" (giai đoạn 3 · Google Drive, backlog B5 phần sau). Phụ thuộc T30 (scope `drive.file`, xong ở T010), T011 (một tài khoản Google mỗi user), T012 (kết nối / ngắt kết nối). Mở đường cho sheet T33.

## 1. Docs – yêu cầu

**Mục tiêu:** Khi người dùng đã kết nối Google Drive tạo một không gian, Taskeo tạo một thư mục Drive cho không gian đó (trong thư mục gốc "Taskeo" của app) và lưu `Space.driveFolderId`. Khi tạo dự án, Taskeo tạo thư mục con trong thư mục không gian và lưu `Project.driveFolderId`. Drive lỗi hoặc chưa kết nối không bao giờ làm hỏng việc tạo không gian / dự án.

**Hiện trạng (2026-11-27, `develop` @ `0c0ce60`):**
- `prisma/schema.prisma` đã có `Space.driveFolderId` và `Project.driveFolderId` (`String?`), chưa có code ghi.
- `POST /api/spaces` → `createSpace` (`src/server/spaces.ts`); `POST /api/spaces/[id]/projects` → `createProject` (`src/server/projects.ts`, transaction cùng activity `project_created`).
- Giao diện vẫn dùng store demo (localStorage); nối giao diện vào API là sheet T59 / backlog B3. Vì vậy ở T013, thư mục chỉ được tạo qua API; giao diện chưa thấy cho tới T59.
- Có sẵn: `getGoogleAuth(userId)` (`src/server/google/client.ts`, ném `GoogleNotConnectedError`), `hasGoogleScope` / `requireGoogleScope` (`granted-scopes.ts`), `GOOGLE_SCOPES.drive`.
- `space-detail.tsx` đã hiện liên kết "Mở thư mục Drive" khi `space.driveFolderId` có giá trị. `Project` phía client chưa có `driveFolderId`.
- Với `drive.file`, app chỉ thấy file / thư mục do chính app tạo (hoặc người dùng mở bằng app).

**Phạm vi:**
- **Module Drive phía server** (`src/server/google/drive-folders.ts`, `server-only`):
  - `ensureRootFolder(drive)`: tìm thư mục gốc của app bằng `files.list` với `q` = `mimeType='application/vnd.google-apps.folder' and appProperties has { key='taskeoRole' and value='root' } and trashed=false`; không có thì tạo thư mục tên `APP_NAME` ("Taskeo") ở My Drive với `appProperties.taskeoRole = "root"`. Không thêm cột DB cho thư mục gốc.
  - `createFolder(drive, { name, parentId, appProperties })`: `files.create` với `mimeType` thư mục, `fields: "id"`, trả id.
  - Thư mục không gian: `appProperties` `{ taskeoRole: "space", taskeoSpaceId }`; thư mục dự án: `{ taskeoRole: "project", taskeoProjectId }`.
- **Hàm thuần** (có test, đặt cạnh module hoặc trong `src/domain/` nếu không đụng Google): chuẩn hoá tên thư mục từ tên không gian / dự án (trim, bỏ ký tự điều khiển, giới hạn độ dài hợp lý, rỗng → tên mặc định), dựng chuỗi `q` tìm thư mục gốc (thoát `'` và `\`), phân loại lỗi Drive (chưa kết nối / thiếu scope / lỗi Google) để log ngắn gọn.
- **Luồng tạo không gian:** sau khi `createSpace` ghi DB thành công, nếu user có `drive.file` → `ensureRootFolder` → tạo thư mục không gian → `UPDATE Space.driveFolderId`. Phản hồi 201 trả `Space` có `driveFolderId` khi tạo được.
- **Luồng tạo dự án:** sau khi `createProject` ghi DB (transaction cũ giữ nguyên), nếu user có `drive.file` → bảo đảm không gian có thư mục (không gian cũ chưa có thì tạo như trên và lưu) → tạo thư mục con cho dự án → `UPDATE Project.driveFolderId`.
- **Best-effort:** chưa kết nối Drive / thiếu scope → không gọi Google, `driveFolderId` giữ `null`, không log lỗi. Google lỗi (mạng, 4xx, 5xx, refresh token bị thu hồi) → vẫn trả 201, `driveFolderId = null`, log một dòng chỉ gồm `userId`, `spaceId`/`projectId`, `error.name` và mã HTTP nếu có — không log token, không log URL / body của gaxios. Đặt timeout cho lời gọi Drive để request tạo không gian không treo lâu.
- **Chế độ demo:** không đổi (không gọi Google, không khởi tạo `googleapis`). Module Drive được import động như `@/server/spaces`.
- **Thông điệp giao diện:** sửa chữ trong `create-dialog.tsx` và `space-detail.tsx` ("Giai đoạn 3 sẽ tự tạo…") cho đúng hiện trạng: chế độ demo không tạo thư mục; khi đã kết nối Drive, thư mục được tạo lúc tạo không gian / dự án.
- Docs: 02 (thư mục Drive: cấu trúc, appProperties, best-effort), 04 (file mới), 06 (`POST /api/spaces` có thể trả `driveFolderId`; hành vi khi Drive lỗi).

**Ngoài phạm vi:**
- Đổi tên / xoá / chuyển thư mục khi sửa / xoá không gian hay dự án (không xoá dữ liệu Drive của người dùng). Ghi vào việc để sau.
- Tạo bù thư mục hàng loạt cho không gian / dự án cũ (chỉ tạo bù không gian khi tạo dự án trong nó).
- Thêm `driveFolderId` vào kiểu `Project` phía client / phản hồi API dự án.
- Nối giao diện vào API (T59), Google Picker, tạo Doc/Sheet/Slide (T33 trở đi).
- Nút "Thử tạo lại thư mục" khi lần đầu lỗi.
- Xử lý trùng hai thư mục gốc khi hai request đồng thời cùng tạo lần đầu (chấp nhận, ghi rủi ro).

**Tiêu chí nghiệm thu** (mỗi dòng kiểm tra được):
- [x] Test hàm thuần: tên thư mục chuẩn hoá đúng (trim, ký tự điều khiển, dài quá, rỗng); chuỗi `q` thoát `'` / `\` đúng; phân loại lỗi đúng.
- [x] Test `drive-folders.ts` với client Drive giả: tìm thấy thư mục gốc → không tạo mới; không có → tạo đúng tên, `mimeType`, `appProperties`; thư mục không gian / dự án tạo đúng `parents` và `appProperties`.
- [x] Test luồng tạo không gian: có `drive.file` → `driveFolderId` được lưu và trả trong `Space`; không có scope / chưa kết nối → không gọi Google, `driveFolderId = null`; Google ném lỗi → vẫn `ok: true`, `driveFolderId = null`, log không chứa token / URL.
- [x] Test luồng tạo dự án: có scope → thư mục con nằm trong thư mục không gian và được lưu; không gian chưa có thư mục → tạo bù rồi tạo thư mục dự án; lỗi Drive → dự án và activity vẫn tạo, `driveFolderId = null`.
- [x] Route `POST /api/spaces` và `POST /api/spaces/[id]/projects` giữ nguyên mã trạng thái và hình dạng lỗi cũ (test route có sẵn vẫn xanh).
- [x] Chế độ demo không đổi: không import `googleapis` khi chạy demo, 4 lệnh xanh.
- [x] Kiểm thật trên dev cùng người dùng: gọi `POST /api/spaces` và `POST /api/spaces/{id}/projects` với tài khoản đã kết nối Drive → My Drive có `Taskeo / <không gian> / <dự án>`, DB lưu đúng hai id; tạo thêm không gian thứ hai dùng lại thư mục "Taskeo" cũ; khi đã ngắt Drive → không gian vẫn tạo, `driveFolderId = null`.
- [x] Chữ ở `create-dialog.tsx` / `space-detail.tsx` đúng hiện trạng.
- [x] 4 lệnh typecheck / lint / test / build xanh.
- [x] Docs 02, 04, 06 cập nhật.

**Tài liệu bị ảnh hưởng:** 02 Google · 04 kiến trúc · 06 API.

## 2. Kế hoạch từng phần

Kết quả kiểm tra của planner (googleapis 190, gaxios 8.3.3):
- `client.ts` là nơi duy nhất import `googleapis` và **chưa ai gọi** → T013 là lần đầu `getGoogleAuth` chạy thật, listener `"tokens"` (rủi ro ghi đè của T012) bắt đầu có tác động.
- googleapis mặc định `retry = true` (GET retry 3 lần khi 5xx/429) → đặt `retry: false`. Timeout của Drive không áp lên bước refresh token → thêm `transporterOptions: { timeout }` cho OAuth2.
- `GaxiosError` mang `config.headers.Authorization`, `config.url`, `response`; `name` là `"Error"`. Chỉ đọc `status` (số 100–599) và nhãn đã phân loại; không log `message` / `config` / `response`.
- Drive API phải được **bật trong Cloud Console** (Library → Google Drive API), nếu không mọi lời gọi trả 403 `accessNotConfigured`. Docs 02 chưa ghi.

Quyết định:
- Gọi Drive trong `createSpace` / `createProject` (lớp server), **sau** khi ghi DB; route không đổi (route test mock trọn module nên giữ xanh). Không dùng `after()` vì 201 phải trả `driveFolderId`.
- `drive-provision.ts` không bao giờ ném; chỉ import động `./client` + `googleapis` sau khi đã thấy scope `drive.file` → chế độ demo / user chưa kết nối không nạp `googleapis`.
- Timeout 5 s mỗi request, `retry: false`, hạn tổng 10 s (`Promise.race`, `clearTimeout` trong `finally`).
- Tên thư mục: NFC, ký tự `\p{Cc}` / `\p{Cf}` → khoảng trắng, gộp khoảng trắng, trim, cắt 200 code point, rỗng → "Không gian không tên" / "Dự án không tên". Giữ `/`.
- Thư mục gốc: `files.list` với `orderBy: "createdTime"`, `pageSize: 1` (nếu lỡ có hai thì luôn dùng cái cũ nhất), không lọc `'root' in parents` (người dùng chuyển "Taskeo" đi đâu vẫn dùng lại được).
- Ghi `driveFolderId` lỗi → vẫn 201, trả `null`. Tạo bù thư mục không gian ghi có điều kiện `driveFolderId: null`.
- **Thêm vào phạm vi:** P3 sửa listener `"tokens"` dùng `updateMany` có điều kiện `refresh_token IS NOT NULL` (việc để sau của T012), vì T013 là lần đầu nó chạy.

| Phần | Việc | File | Agent | Test cần viết (viết trước) |
|---|---|---|---|---|
| P1 | `toDriveFolderName(raw, fallback)`, `DRIVE_FOLDER_NAME_MAX = 200`, tên mặc định | `src/domain/drive-folder-name.ts` (+ test) | feature-builder | trim; gộp khoảng trắng; `\n \t \u0000 \u007F \u0085` → khoảng trắng; `‮ ​` bỏ; >200 cắt không vỡ emoji; rỗng / toàn ký tự điều khiển → fallback; NFC; giữ `/` và tiếng Việt |
| P2 | `escapeDriveQueryValue`, `appPropertyQuery`, `rootFolderQuery`; `classifyDriveError`, `driveErrorLogFields` | `src/server/google/drive-query.ts`, `src/server/google/drive-errors.ts` (+ test) | google-integrator | thoát `\` trước `'`; `rootFolderQuery()` đúng chuỗi spec; phân loại `not_connected` / `scope_missing` / `timeout` / `google` (+status) / `unknown`; status lạ bị bỏ; kết quả không chứa message / config / url |
| P3 | `client.ts`: OAuth2 dạng options + `transporterOptions.timeout`; `persistTokens` → `updateMany` where `refresh_token: { not: null }` | `src/server/google/client.ts` (+ test) | google-integrator | constructor nhận timeout; listener gọi `updateMany` có điều kiện; 0 dòng không ném, không log token |
| P4 | `DRIVE_FOLDER_MIME`, `DriveFilesClient`, `ensureRootFolder`, `createFolder`, `DriveFolderMissingIdError` | `src/server/google/drive-folders.ts` (+ test) | google-integrator | Drive giả: có gốc → không tạo; chưa có → tạo `APP_NAME`, mime thư mục, `appProperties.taskeoRole=root`, `fields: "id"`; `createFolder` gửi `parents` + `appProperties`; `data.id` rỗng → ném |
| P5 | `provisionSpaceFolder`, `provisionProjectFolder`, `defaultDeps` (scope check, `getDrive` import động), hạn tổng, không bao giờ ném, log an toàn | `src/server/google/drive-provision.ts` (+ test) | google-integrator | không scope → không gọi `getDrive`, không log, không nạp `googleapis`; `GoogleNotConnectedError` → `null` không log; lỗi giả chứa token → `null`, một dòng log không có token / URL; quá hạn → `TimeoutError`; dự án: không gian có thư mục / chưa có (tạo bù) / lỗi; `hasDriveScope` ném → `null` |
| P6 | `createSpace` gọi `provisionSpaceFolder`, ghi `driveFolderId` (best-effort); JSDoc route | `src/server/spaces.ts` (+ test), JSDoc `src/app/api/spaces/route.ts` | api-builder | có id → `updateMany {id,userId}`, trả `driveFolderId`; `null` → không ghi; ghi lỗi → vẫn `ok`, `null`; `limit` → không provision |
| P7 | `createProject` đọc không gian kèm `name` / `driveFolderId`, sau transaction gọi `provisionProjectFolder`, ghi hai id (best-effort) | `src/server/projects.ts` (+ test) | api-builder | lưu đúng id; tạo bù ghi có điều kiện `driveFolderId: null`; ghi lỗi → vẫn `ok`, activity vẫn ghi; conflict / not_found / limit → không provision; `expectAllWhereHaveUserId` bao `updateMany` mới |
| P8 | Sửa chữ "Giai đoạn 3 sẽ tự tạo…" | `src/components/layout/create-dialog.tsx`, `src/features/spaces/space-detail.tsx` | feature-builder | không (chữ tĩnh) |
| P9 | Docs 02 (bật Drive API, cây thư mục, appProperties, best-effort, timeout, mồ côi / trùng), 04, 06 | `docs/02-google-cloud.md`, `docs/04-architecture.md`, `docs/06-api.md` | tự làm | — |

Thứ tự: đợt 1 song song P1, P2, P3, P8 → P4 → P5 → song song P6, P7 → P9 → kiểm thật trên dev.

Rủi ro / phụ thuộc:
- Người dùng phải bật **Google Drive API** trong Cloud Console trước khi kiểm thật (thiếu → 403, request vẫn 201 nhưng không có thư mục).
- Trùng thư mục gốc khi hai request đầu tiên đồng thời; thư mục không gian mồ côi khi hai dự án đồng thời tạo bù — chấp nhận, DB vẫn nhất quán.
- Lời gọi bị bỏ sau hạn tổng có thể vẫn tạo thư mục mồ côi trên Drive (không ghi DB).
- Thư mục không gian đã vào thùng rác → thư mục dự án tạo trong thùng rác; đã xoá hẳn → 404, log rồi bỏ qua. Để sau.
- PATCH / DELETE không đồng bộ Drive (cố ý). POST có thể chậm thêm tới 10 s.
- `drive_v3.Drive` có thể không gán khớp `DriveFilesClient` do overload → ép kiểu một chỗ ở `getDrive` nếu cần.

Duyệt kế hoạch: ☐ chờ · ☑ người dùng đã duyệt (2026-11-27, giữ P3) · ☐ bỏ qua (`--yes`)

## 3. Thực hiện + kiểm thử

| Phần | Commit | Test thêm | typecheck | lint | test | build |
|---|---|---|---|---|---|---|
| P1 | `d5328e5` | 13 (`drive-folder-name.test.ts`) | ✅ | ✅ | ✅ | ✅ |
| P2 | `5681864` | 45 (`drive-query` 9, `drive-errors` 36) | ✅ | ✅ | ✅ | ✅ |
| P3 | `a03614e` | +4 mới, sửa test cũ (`client.test.ts` 13) | ✅ | ✅ | ✅ | ✅ |
| P8 | `c61f60f` | — (chữ tĩnh) | ✅ | ✅ | ✅ 998/998 (đợt 1) | ✅ |
| P4 | `8027436` | 14 (`drive-folders.test.ts`, kèm kiểm kiểu `drive_v3.Drive` → `DriveFilesClient`) | ✅ | ✅ | ✅ 1012/1012 | ✅ |
| P5 | `27b8852` | 23 (`drive-provision.test.ts`) | ✅ | ✅ | ✅ 1035/1035 | ✅ |
| P6 | `37f578d` | 6 (`spaces.test.ts`) | ✅ | ✅ | ✅ | ✅ |
| P7 | `d9ee681` | 8 + kiểm "không provision" ở các nhánh lỗi (`projects.test.ts`) | ✅ | ✅ | ✅ 1049/1049 (P6+P7) | ✅ |
| P9 | `c411772` | — (docs 02, 04, 06) | — | — | — | — |

Ghi chú: refresh token có timeout 10 s mỗi lần thử nhưng google-auth-library vẫn retry refresh, nên hạn tổng 10 s của `drive-provision.ts` mới là giới hạn thật. Kiểm thật trên dev (cần bật Google Drive API) làm ở bước 7.

## 4. Review code

Reviewer đã chạy (trên `git diff develop...HEAD` @ `e8f9c19`): `layer-reviewer`; review TypeScript và review bảo mật giao cho agent `general-purpose` (repo chưa có agent `typescript-reviewer` / `security-reviewer`). Không có CRITICAL / HIGH.

| # | Mức | File:dòng | Vấn đề | Reviewer |
|---|---|---|---|---|
| R1 | MEDIUM | `src/server/projects.ts` `provisionAndSaveFolders`; `drive-provision.ts:140-151` | Hai dự án tạo đồng thời trong không gian chưa có thư mục: mỗi request tạo một thư mục không gian; ghi có điều kiện chỉ giữ một, nhưng `Project.driveFolderId` của request thua vẫn được lưu và trỏ vào thư mục dự án nằm trong thư mục không gian mồ côi. Trái với "DB vẫn nhất quán" | typescript, security (LOW) |
| R2 | MEDIUM | `drive-provision.ts:56-74`, `drive-folders.ts` | Hết hạn tổng chỉ ngừng chờ, không huỷ request Drive: thư mục vẫn được tạo sau đó (mồ côi, không ghi DB); không gian mồ côi khiến lần tạo dự án sau tạo bù thêm một thư mục không gian | typescript, security (LOW) |
| R3 | LOW | `drive-provision.test.ts:234-248, 413-437` | Test quá hạn chỉ dùng promise không bao giờ settle; chưa kiểm resolve / reject muộn không đổi kết quả, không log lần hai | typescript |
| R4 | LOW | `drive-provision.test.ts:104-115` | Test "không nạp googleapis" dựa vào cờ `mocks.loaded` không reset → phụ thuộc thứ tự test | typescript |
| R5 | LOW | `drive-provision.ts:140`, `drive-folders.ts` | Thư mục không gian đã vào thùng rác vẫn được dùng làm cha → thư mục dự án nằm trong thùng rác, không log | typescript |
| R6 | LOW | `drive-query.ts` `rootFolderQuery` | Không lọc `'me' in owners`: khi có Picker (T33+), thư mục gốc người khác chia sẻ có thể được chọn làm gốc | security |
| R7 | LOW | `spaces.ts:104`, `projects.ts:216` | Quota Drive API dùng chung cho mọi user, không có rate limit tạo không gian / dự án | security |
| R8 | LOW | `drive-provision.ts:6-8`, `spaces.ts:7` | Comment nói "không kéo googleapis" nhưng chưa nói module chỉ được nạp ở chế độ configured (qua `server/spaces`, `server/projects`) | layer |
| R9 | LOW | `client.ts:27-36` | Persist token trễ qua cả một lần ngắt + kết nối lại có thể ghi đè token mới (guard chỉ kiểm `refresh_token` khác null) — gần như không xảy ra | security (info) |
| R10 | LOW | `drive-folder-name.ts` | Thay `\p{Cf}` gồm cả ZWJ (U+200D) → emoji ghép (gia đình…) bị tách | security (info) |

## 5. Fix bug

Trước bước 5: `745f6fc`.

| Phát hiện | Xử lý | Commit |
|---|---|---|
| R1 | đã sửa: `provisionProjectFolder` chỉ tạo thư mục dự án dưới `parentFolderId`; `projects.ts` tạo bù thư mục không gian bằng `provisionSpaceFolder`, ghi có điều kiện `driveFolderId: null`, **đọc lại** id đã lưu rồi mới tạo thư mục dự án → request thua dùng thư mục của request thắng (test ca đua) | `35f373a` |
| R2 | đã sửa: `runBestEffort` có `AbortController`, hết hạn → `abort(TimeoutError)`; `signal` truyền vào `files.list` / `files.create`, kiểm `throwIfAborted()` trước mỗi bước. Refresh token không nhận signal (ghi JSDoc + docs 02) | `35f373a` |
| R3 | đã sửa: test promise settle sau hạn (resolve muộn không đổi kết quả, không gọi bước sau; reject muộn chỉ một log, không unhandled rejection; signal đã abort) | `35f373a` |
| R4 | đã sửa: `vi.resetModules()` + import động lại, kiểm thêm mock `getGoogleAuth` / `google.drive` không được gọi | `35f373a` |
| R5 | để sau (LOW): kiểm `trashed` của thư mục không gian trước khi dùng | — |
| R6 | đã sửa: `rootFolderQuery()` thêm `and 'me' in owners` | `35f373a` |
| R7 | để sau (LOW): rate limit chung ở sheet T73 | — |
| R8 | đã sửa: comment đầu `drive-provision.ts` nói rõ chỉ nạp ở chế độ configured | `35f373a` |
| R9 | để sau (LOW): guard persist theo đúng refresh token đã đọc | — |
| R10 | để sau (LOW): giữ ZWJ trong tên thư mục | — |

Kết quả 4 lệnh sau khi sửa (tự chạy): typecheck ✅ · lint ✅ · test ✅ 1063/1063 · build ✅.

## 6. Review lại

Vòng 1 (`git diff 745f6fc..2c3ec8f`; `layer-reviewer` + `general-purpose` kiêm TypeScript / bảo mật): không có CRITICAL / HIGH. Xác nhận R1, R2, R3, R6, R8 đúng (đường đi `signal` tới gaxios 8.3.3 `AbortSignal.any` đã kiểm trong node_modules). Phát hiện mới:

| # | Mức | Vấn đề | Xử lý |
|---|---|---|---|
| R11 | MEDIUM | Bản sửa R4 vẫn giả xanh: `vi.resetModules()` không chạy lại factory `vi.mock`, nên cờ "đã nạp" không bao giờ bật dù có import tĩnh `googleapis` (reviewer tái hiện trong scratch) | đã sửa ở `3c376a2`: `vi.doMock` factory mới sau `resetModules`; kiểm ngược: thêm tạm `import "googleapis"` / `import "./client"` tĩnh → test đỏ, rồi gỡ |
| R12 | LOW | Comment + docs 02 hứa "không tạo thư mục nào sau khi huỷ"; request đang bay vẫn có thể hoàn tất phía Google | đã sửa ở `3c376a2`: "không bắt đầu lời gọi Drive mới; request đang bay có thể vẫn tạo thư mục mồ côi, không ghi DB" |
| R13 | LOW | Tạo dự án trong không gian chưa có thư mục: hai hạn 10 s nối tiếp, hai lần lấy client / refresh → có thể ~20 s | để sau: đã ghi ở docs 02; gom một hạn + một client khi cần |
| R14 | LOW | Listener `unhandledRejection` trong test chỉ gỡ trong `flush()`, rò rỉ nếu assert lỗi trước | đã sửa ở `3c376a2`: gỡ trong `afterEach` |

Kết quả 4 lệnh sau vòng 2 (tự chạy): typecheck ✅ · lint ✅ · test ✅ 1063/1063 · build ✅.

Vòng 2 (`git diff 183d5a7~2..183d5a7~1`, tức `3c376a2`; `general-purpose` kiêm TypeScript / bảo mật / quy ước): không có phát hiện. Xác nhận R11 thật sự bắt lỗi (thêm tạm import tĩnh `googleapis` hoặc `./client` → test đỏ; chạy xáo trộn thứ tự 5 seed đều xanh; bỏ bước khôi phục mock → 2 test `getDrive` đỏ, nên bước đó cần thiết), R12 đúng với code, R14 luôn gỡ listener. → `7-final`.

## 7. Final

**Tóm tắt:** Đóng T31 trong sheet. Khi user có `drive.file`, `createSpace` tạo thư mục `Taskeo / <không gian>` (thư mục gốc tìm qua `appProperties.taskeoRole=root` + `'me' in owners`, không lưu DB) và lưu `Space.driveFolderId`; `createProject` tạo thư mục con, lưu `Project.driveFolderId` — không gian chưa có thư mục thì tạo bù, ghi có điều kiện rồi đọc lại id để hai request đồng thời luôn dùng chung một thư mục không gian. Best-effort: chưa có scope → không nạp `googleapis`; Google lỗi / quá hạn / ghi DB lỗi → vẫn 201 với `driveFolderId = null`, log chỉ tên lỗi đã phân loại + mã HTTP. Timeout 5 s mỗi request Drive (`retry: false`), hạn tổng 10 s có `AbortController`, refresh token 10 s mỗi lần thử. Thêm: listener `"tokens"` không ghi lại token sau khi ngắt kết nối (rủi ro của T012). Module mới: `domain/drive-folder-name.ts`, `server/google/drive-{query,errors,folders,provision}.ts`. Test: 937 (sau T012) → 1063. 4 lệnh lần cuối (@ `54de816`, code không đổi từ `3c376a2`): typecheck ✅ · lint ✅ · test ✅ 1063/1063 · build ✅.

**Tiêu chí nghiệm thu:** đánh dấu cả 10 ở mục 1. Kiểm thật trên dev (2026-11-27, cùng người dùng, sau khi bật Google Drive API):
- Đã kết nối Drive: `POST /api/spaces` "T013 test A" → 201, có `driveFolderId`; `POST /api/spaces/{A}/projects` "T013 dự án 1" → 201, DB có `Project.driveFolderId`; "T013 test B" → 201, có `driveFolderId`. Người dùng xác nhận My Drive có đúng **một** thư mục "Taskeo" chứa A (bên trong có dự án 1) và B.
- Đã ngắt Drive: "T013 test C" + "T013 dự án C", "T013 test D" + "T013 dự án D" → 201, `driveFolderId = null` (DB xác nhận; Account không còn scope Drive / token).
- Ghi chú: khi tạo C có **một** dòng log `[google/drive] Không tạo được thư mục Drive` (file log của Next chỉ ghi `{}`, không đọc được các trường); lặp lại ở D (đã ngắt hẳn) không có log. Suy luận: lúc tạo C, thao tác ngắt kết nối chưa ghi xong DB (scope còn, token đã bị Google thu hồi → refresh lỗi → log đúng hành vi best-effort), tới dự án C thì DB đã sạch. Chưa chứng minh được.

**Tài liệu đã cập nhật:** `docs/02-google-cloud.md` (bật Google Drive API, cây thư mục, `appProperties`, best-effort, timeout / abort, đồng thời, không đồng bộ khi sửa / xoá, listener `"tokens"`), `docs/04-architecture.md` (5 file mới, ghi chú `client.ts`), `docs/06-api.md` (hai `POST`), `docs/tasks/README.md`.

**Merge vào develop:** commit `6f3752b`, 2026-11-27

**Việc để sau:**
- Dữ liệu kiểm thật trên DB dev: không gian "T013 test A–D" (kèm dự án) và thư mục tương ứng trên Drive — xoá khi người dùng muốn.
- Khi nối giao diện vào API (T59): chữ `NOTES` trong `create-dialog.tsx` đang ghi "Chế độ demo:" — chỉ hiện ở demo hoặc viết lại.
- LOW: R5 thư mục không gian trong thùng rác; R7 rate limit (sheet T73); R9 guard persist theo đúng refresh token; R10 giữ ZWJ trong tên; R13 gom một hạn + một client khi tạo bù thư mục không gian (~20 s).
- Đổi tên / xoá thư mục khi sửa / xoá không gian hay dự án; nút tạo lại thư mục khi lần đầu lỗi; tạo bù hàng loạt cho không gian cũ.
- Log của `next dev` ghi object thành `{}` trong `.next/dev/logs/` — khi cần điều tra, đọc stdout của server.
- Tiếp theo theo sheet: T33.
