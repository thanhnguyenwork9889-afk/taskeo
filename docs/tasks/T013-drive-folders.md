# T013 · Tạo thư mục Google Drive khi tạo không gian / dự án

| | |
|---|---|
| Nhánh | `feat/T013-drive-folders` |
| Tạo từ | `develop` @ `0c0ce60` |
| Trạng thái | 3-build |
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
- [ ] Test hàm thuần: tên thư mục chuẩn hoá đúng (trim, ký tự điều khiển, dài quá, rỗng); chuỗi `q` thoát `'` / `\` đúng; phân loại lỗi đúng.
- [ ] Test `drive-folders.ts` với client Drive giả: tìm thấy thư mục gốc → không tạo mới; không có → tạo đúng tên, `mimeType`, `appProperties`; thư mục không gian / dự án tạo đúng `parents` và `appProperties`.
- [ ] Test luồng tạo không gian: có `drive.file` → `driveFolderId` được lưu và trả trong `Space`; không có scope / chưa kết nối → không gọi Google, `driveFolderId = null`; Google ném lỗi → vẫn `ok: true`, `driveFolderId = null`, log không chứa token / URL.
- [ ] Test luồng tạo dự án: có scope → thư mục con nằm trong thư mục không gian và được lưu; không gian chưa có thư mục → tạo bù rồi tạo thư mục dự án; lỗi Drive → dự án và activity vẫn tạo, `driveFolderId = null`.
- [ ] Route `POST /api/spaces` và `POST /api/spaces/[id]/projects` giữ nguyên mã trạng thái và hình dạng lỗi cũ (test route có sẵn vẫn xanh).
- [ ] Chế độ demo không đổi: không import `googleapis` khi chạy demo, 4 lệnh xanh.
- [ ] Kiểm thật trên dev cùng người dùng: gọi `POST /api/spaces` và `POST /api/spaces/{id}/projects` với tài khoản đã kết nối Drive → My Drive có `Taskeo / <không gian> / <dự án>`, DB lưu đúng hai id; tạo thêm không gian thứ hai dùng lại thư mục "Taskeo" cũ; khi đã ngắt Drive → không gian vẫn tạo, `driveFolderId = null`.
- [ ] Chữ ở `create-dialog.tsx` / `space-detail.tsx` đúng hiện trạng.
- [ ] 4 lệnh typecheck / lint / test / build xanh.
- [ ] Docs 02, 04, 06 cập nhật.

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

Duyệt kế hoạch: ☑ chờ · ☐ người dùng đã duyệt (ngày) · ☐ bỏ qua (`--yes`)

## 3. Thực hiện + kiểm thử

| Phần | Commit | Test thêm | typecheck | lint | test | build |
|---|---|---|---|---|---|---|
| P1 | | | | | | |

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
