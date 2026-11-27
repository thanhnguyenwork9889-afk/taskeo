# T017 · Tạo Doc / Sheet / Slide trong thư mục Drive, mở tab mới tới file

| | |
|---|---|
| Nhánh | `feat/T017-drive-create-file` |
| Tạo từ | `develop` @ `2b64678` |
| Trạng thái | done |
| Ngày tạo | 2026-11-27 |

Nguồn: sheet nhiệm vụ, dòng **T32** "Tạo Doc/Sheet/Slide trong thư mục, mở tab mới tới file" (giai đoạn 4 · Google Drive, phụ thuộc T31 = T013). Sheet đã chuyển `Chưa làm` → `Đang làm` khi khởi tạo.

## 1. Docs – yêu cầu

**Mục tiêu:** Ở chế độ `configured`, người dùng đã kết nối Google Drive bấm "Tạo tài liệu", chọn loại (Soạn thảo / Bảng tính / Trình chiếu), tên, không gian (và dự án nếu muốn) → app tạo file Google trống thật trong thư mục Drive của không gian / dự án đó, mở file trong tab mới, và file hiện ngay ở "Tài liệu gần đây" và `/docs`.

**Hiện trạng (2026-11-27, `develop` @ `2b64678`):**
- `CreateDialog` (`components/layout/create-dialog.tsx`) có loại `doc`: chọn loại, không gian, dự án — nhưng ở mọi chế độ chỉ ghi vào store demo (`createFile`), kèm câu "Chế độ demo: chưa tạo tệp trên Google Drive".
- Nút mở hộp thoại: `/docs` (`docs-view.tsx`), trang không gian (`space-detail.tsx`, 2 chỗ), trang dự án (`project-detail.tsx`). Danh sách không gian / dự án trong hộp thoại lấy từ store demo; **ID store không trùng ID DB cho tới T59**.
- Server: `Space.driveFolderId` / `Project.driveFolderId` (T013, có thể `null` nếu tạo khi chưa kết nối Drive hoặc Drive lỗi); `provisionSpaceFolder` / `provisionProjectFolder` (best-effort, hạn 10 s); `DriveFilesClient.files.create` đã có; `DOC_KIND_MIME`, `toDriveFileItem`, `classifyDriveError`, `runWithDeadline`, `failWithCode` + `DRIVE_NOT_CONNECTED_CODE`.
- Client: `QueryProvider`, `useDriveFiles` (queryKey của danh sách file), `fetchDriveFiles` / `ApiRequestError` ở `features/docs/drive-files-api.ts`. Chưa có hook đọc `/api/spaces` ở client.
- `DriveDocsEmpty` ghi "tạo file Drive thật chưa có (T32)".
- Script dev `scripts/dev-create-doc.mjs` (T015) tạo file thử — sau nhiệm vụ này không còn cần cho kiểm thật.

**Phạm vi:**
- **Server Drive** (`src/server/google/`): hàm tạo file Google trống (`files.create`, `mimeType` theo `DOC_KIND_MIME`, `parents: [folderId]`, `fields` tối thiểu `id, name, mimeType, modifiedTime, webViewLink, parents`). Kiểm scope trước, chỉ import động client / `googleapis` sau khi có scope, hạn tổng 10 s, kết quả `ok` / `not_connected` / `error`, log một dòng an toàn (không token / URL / message).
- **Hàm truy vấn** `src/server/drive-files.ts` (hoặc file mới cạnh nó): `createFile(userId, { name, kind, spaceId, projectId? })`:
  - Không gian / dự án phải thuộc user; `projectId` phải thuộc đúng `spaceId` → nếu không thì `not_found`.
  - Thư mục đích = thư mục dự án (nếu có `projectId`) hoặc thư mục không gian. Thư mục đó còn `null` → tạo thư mục bổ sung (dùng lại `provisionSpaceFolder` / `provisionProjectFolder`, lưu `driveFolderId`; dự án mà không gian chưa có thư mục thì tạo cả thư mục không gian trước). Tạo bổ sung không được → `drive_error` (không tạo file ra ngoài thư mục Taskeo).
  - Trả `DriveFileItem` (cùng hình dạng `GET /api/files`).
  - Ghi `Activity` không bắt buộc (planner quyết; nếu ghi thì cần loại mới — mặc định **không** ghi, để sau).
- **Validation** (`domain/validation.ts`): schema body `{ name (1–SPACE_NAME_MAX, trim), kind (doc|sheet|slide), spaceId, projectId? }`.
- **API** `POST /api/files` → 201 `{ data: { file: DriveFileItem } }` · 400 body sai · 401 · 403 `code: "drive_not_connected"` · 404 không gian / dự án · 502 Google lỗi / quá hạn · 503 demo. Import động như `GET`.
- **Giao diện (chế độ `configured`):**
  - Hộp thoại tạo tài liệu: chế độ demo giữ nguyên (store). `configured` + đã kết nối Drive → danh sách không gian / dự án lấy từ API (`GET /api/spaces`, `GET /api/spaces/[id]/projects`) vì ID store không khớp DB; gửi `POST /api/files`; nút "Tạo mới" bị khoá + chữ "Đang tạo…" khi đang gửi; lỗi hiện thông báo (403 → mời kết nối Drive, 502 → thử lại).
  - Chưa kết nối Drive → hộp thoại hiện lời mời kết nối (không gửi gì). Chưa có không gian nào trong DB → hướng dẫn tạo không gian trước.
  - Mở tab mới tới `webViewLink` mà **không bị chặn popup**: mở `window.open("", "_blank")` ngay trong sự kiện bấm (đặt `opener = null`), rồi gán `location` khi API trả về; lỗi thì đóng tab đó. Không mở được tab (bị chặn) → thông báo kèm liên kết mở file.
  - Thành công → invalidate query danh sách file Drive để "Tài liệu gần đây" / `/docs` thấy file mới; đóng hộp thoại; thông báo "Đã tạo …".
  - Nút từ trang không gian / dự án truyền ID store; ở `configured` ID đó không có trong danh sách API → chọn mặc định không gian đầu tiên (không lỗi). Ghi chú cho T59.
  - Sửa `DriveDocsEmpty` (`/docs`): bỏ câu "chưa có (T32)", mời "Tạo tài liệu" khi rỗng.
- Docs: 02 (tạo file với `drive.file`), 04 (file / hàm mới), 06 (`POST /api/files`).

**Ngoài phạm vi:**
- Google Picker / gắn file có sẵn (T34), gắn file vào công việc (T60).
- Nối trang không gian / dự án và danh sách hộp thoại ở chế độ demo vào API (T59).
- Tạo từ mẫu (template), đổi tên / xoá file Drive, ghi Activity `file_created`.
- Rate limit (T73). Xoá `scripts/dev-create-doc.mjs` (có thể giữ để thử, ghi vào việc để sau).

**Tiêu chí nghiệm thu** (mỗi dòng kiểm tra được):
- [x] Test hàm Drive tạo file với client giả: không scope → không gọi Drive, `not_connected`; tham số `files.create` đúng (mimeType theo loại, `parents`, `fields`); thiếu `id` → `error`; lỗi Gaxios → `error`, log không chứa token / URL; quá hạn → `error`.
- [x] Test hàm truy vấn `createFile`: không gian / dự án của user khác → `not_found`; `projectId` không thuộc `spaceId` → `not_found`; thư mục dự án được chọn khi có `projectId`; thư mục `null` → tạo bổ sung và lưu `driveFolderId`; tạo bổ sung lỗi → `drive_error`, không gọi tạo file; trả `DriveFileItem` đúng tên không gian / dự án.
- [x] Test route `POST /api/files`: 401, 503 (demo), 400 (thiếu tên, tên quá dài, `kind` sai, JSON hỏng), 404, 403 có `code`, 502, 201 đúng hình dạng.
- [x] Test hàm thuần phía client (gọi API tạo file, chọn trạng thái hộp thoại, xử lý tab mở trước) — logic tách khỏi component vì không có jsdom.
- [x] Chế độ demo: hộp thoại tạo tài liệu như cũ (ghi store), không gọi `/api/files` / `/api/spaces`. (Kiểm qua code + review: nhánh `isDemo` render form store, không mount hook API; route trả 503 trước import động. Chưa chạy tay ở chế độ demo.)
- [x] Chế độ `configured`, chưa kết nối Drive: hộp thoại hiện lời mời kết nối, không lỗi. (Kiểm qua test `createDocDialogState` + code: `useApiSpaces({ enabled: driveConnected })`; tài khoản dev đã kết nối nên chưa chạy tay nhánh này.)
- [x] Kiểm thật trên dev cùng người dùng: tạo một Doc, một Sheet, một Slide (ít nhất một cái trong dự án) → file nằm đúng thư mục `Taskeo / <không gian> [/ <dự án>]` trên Drive, tab mới mở đúng file, file hiện ở "Tài liệu gần đây" và `/docs` không cần tải lại trang.
- [x] 4 lệnh typecheck / lint / test / build xanh.
- [x] Docs 02, 04, 06 cập nhật.

**Tài liệu bị ảnh hưởng:** 02 Google · 04 kiến trúc · 06 API.

## 2. Kế hoạch từng phần

| Phần | Việc | File | Agent | Test cần viết |
|---|---|---|---|---|
| P1 | `types.ts`: `CreateFileResponse { file: DriveFileItem }`. `validation.ts`: `createFileInputSchema` (strict; `name` trim 1–`SPACE_NAME_MAX`, `kind`, `spaceId`, `projectId` rỗng → undefined) + `CreateFileInput`. `domain/drive-files.ts`: `DEFAULT_DRIVE_FILE_NAME`, `toDriveFileName` (dùng lại `toDriveFolderName`), `DRIVE_FILE_CREATE_FIELDS` | `src/domain/{types,validation,drive-files}.ts` (+test) | feature-builder | schema: tên rỗng / chỉ khoảng trắng / 201 ký tự, `kind` sai, thiếu `spaceId`, `projectId` rỗng, khoá lạ, trim; `toDriveFileName`: ký tự điều khiển, rỗng → mặc định |
| P2 | `server/google/drive-files.ts`: `createDriveFile(userId, { name, kind, parentId }, deps)` → `ok {file}` / `not_connected` / `error`. Kiểm scope trước (không có → không gọi `getDrive`), `runWithDeadline` 10 s, `files.create` (mimeType theo `DOC_KIND_MIME`, `parents`, `fields`), thiếu `id` → `error`; lỗi im lặng → `not_connected`; lỗi khác → log 1 dòng an toàn. Không bao giờ ném | `src/server/google/drive-files.ts` (+test) | google-integrator | không scope → không gọi Drive; tham số đúng cả 3 loại + `signal`; thiếu id; lỗi Gaxios (header Authorization, URL) → log sạch; `GoogleNotConnectedError`; quá hạn |
| P3 | Tách `resolveSpaceFolderId` từ `projects.ts` sang `server/drive-folder-sync.ts`: `ensureSpaceFolderId`, `ensureProjectFolderId` (tạo thư mục không gian trước nếu cần; provision → ghi có điều kiện `driveFolderId: null` → đọc lại; trả `string \| null`, không ném; giữ chuỗi log `[projects]`). `projects.ts` gọi lại, hành vi không đổi | `src/server/drive-folder-sync.ts` (+test), `src/server/projects.ts` | api-builder | đã có id → không provision; null → provision + ghi + đọc lại; thua đua → id đọc lại; provision null → null, không ghi; dự án khi không gian chưa có thư mục; `projects.test.ts` cũ còn xanh |
| P4 | `server/drive-files.ts`: `createFile(userId, input, deps)` → `{ ok, file }` / `not_found` / `drive_not_connected` / `drive_error`. Không gian + dự án thuộc user, dự án thuộc đúng `spaceId`. Thư mục đích null → kiểm scope (không có → `drive_not_connected`) → `ensure*` (null → `drive_error`, không tạo file). Ánh xạ bằng `toDriveFileItem`. Không ghi Activity | `src/server/drive-files.ts` (+test) | api-builder | user khác → not_found; dự án khác không gian → not_found; parent = thư mục dự án; tạo bù rồi tạo file; tạo bù lỗi → không gọi tạo file; chưa scope khi cần tạo bù; truyền kết quả P2; đúng `spaceName` / `projectName` |
| P5 | `POST /api/files` theo khuôn `POST /api/spaces`: `getApiUserId` → `readJson` → schema → import động → 201 `{ file }` · 400 · 401 · 403 `drive_not_connected` · 404 · 502 · 503 · 500. Không đổi `GET` | `src/app/api/files/route.ts` (+test) | api-builder | 401; 503 không import động; 400 (thiếu tên, quá dài, kind sai, JSON hỏng, khoá lạ); 404 không gian / dự án; 403 có code; 502; 201; test GET cũ xanh |
| P6 | Nền client ở `components/layout` (vì `AppShell` render `CreateDialog`, không được import `features`): `query-keys.ts` (`DRIVE_FILES_QUERY_KEY`, key spaces / projects); `create-doc-api.ts` (`CreateDocRequestError`, `fetchApiSpaces`, `fetchApiProjects`, `postDriveFile` kiểm hình dạng + `isDriveUrl`, `buildCreateFileBody`); `create-doc-state.ts` (`createDocDialogState`, `initialSpaceId`, `initialProjectId`, `createDocErrorMessage`); `pending-tab.ts` (`openPendingTab` mở `""` + `opener = null`, `finishPendingTab` → opened / blocked / no_url, `closePendingTab`); `use-create-doc-data.ts`. `use-drive-files.ts` dùng `[...DRIVE_FILES_QUERY_KEY, params]`. Chuyển `DriveConnectPrompt` sang `components/layout/drive-connect-prompt.tsx` (re-export ở chỗ cũ) | `src/components/layout/{query-keys,create-doc-api,create-doc-state,pending-tab,use-create-doc-data}.ts`, `drive-connect-prompt.tsx`, `src/features/docs/{use-drive-files.ts,drive-files-states.tsx}` | feature-builder | body; fetch giả (201, 403 code, 502, JSON hỏng, sai hình dạng, url lạ); bảng trạng thái; `initialSpaceId` (ID store lạ → đầu tiên, rỗng → ""); thông báo lỗi; pending-tab với `open` giả; key là tiền tố |
| P7 | `create-doc-dialog.tsx`: `DriveCreateDocDialog` — chưa kết nối → lời mời; tải / lỗi / chưa có không gian; form loại / tên / không gian / dự án (API). Submit: `openPendingTab` đồng bộ trước `await mutateAsync`; thành công → invalidate `DRIVE_FILES_QUERY_KEY`, `finishPendingTab`: opened → notify + đóng, blocked → giữ hộp thoại với liên kết mở file; lỗi → đóng tab trước, hiện thông báo. Khoá nút "Đang tạo…", chặn đóng khi đang gửi. `create-dialog.tsx`: `kind === "doc"` bọc `Suspense` + `useViewer()`, demo giữ form store, còn lại render hộp thoại mới; dùng chung `DocKindField` | `src/components/layout/{create-doc-dialog,create-dialog}.tsx` | feature-builder | không jsdom → logic test ở P6; kiểm tay: demo, chưa kết nối, chưa có không gian, thành công, popup bị chặn, 502 |
| P8 | `/docs` rỗng: `DriveDocsEmpty` nhận `onCreate`, mời "Tạo tài liệu" khi không tìm kiếm, bỏ ghi chú "(T32)" | `src/features/docs/docs-view.tsx` | feature-builder | không (kiểm tay) |
| P9 | Docs 02 (tạo file với `drive.file`, tạo bù thư mục, 403 / 502), 04 (file mới), 06 (`POST /api/files`) | `docs/02-google-cloud.md`, `docs/04-architecture.md`, `docs/06-api.md` | tự làm | không |

Thứ tự: P1 → (P2 ∥ P3 ∥ P6) → P4 → (P5 ∥ P7) → P8 → kiểm thật cùng người dùng → P9.

Quyết định thiết kế:
- Hộp thoại configured + hook đọc `/api/spaces` nằm ở `components/layout` (đúng luật lớp; tiền lệ `drive-storage-api.ts`). Gộp các lớp lỗi fetch thành helper chung để sau.
- Không đổi chữ ký `provision*`: chỉ kiểm scope khi cần tạo bù để phân biệt 403 / 502.
- Mở tab trước trong handler, không dùng feature `noopener` (khiến `window.open` trả `null`), gán `opener = null`; kiểm lại `isDriveUrl` trước khi gán `location`.
- Popup bị chặn → liên kết ngay trong hộp thoại (toast chỉ nhận chuỗi).
- ID store không khớp danh sách API → chọn không gian đầu tiên, không gắn dự án (T59 xử lý).
- Tên file chuẩn hoá bằng `toDriveFolderName`; không gắn `appProperties`, không ghi Activity.

Rủi ro / phụ thuộc:
- P3 đụng `projects.ts`: giữ nguyên chuỗi log `[projects]`, chạy toàn bộ `projects.test.ts`. Phương án dự phòng: không tách, chấp nhận lặp ~25 dòng.
- Token hỏng nhưng scope còn → tạo bù trả 502 thay vì 403 (ghi docs 02).
- Tạo bù + tạo file có thể tới ~20 s; quá hạn ở bước tạo file có thể để lại file mồ côi (như thư mục mồ côi ở T013).
- Không có jsdom: hộp thoại / Suspense / popup chỉ kiểm tay (Chrome, cả khi bật chặn popup).
- Kiểm thật cần tài khoản đã kết nối Drive, một không gian + một dự án tạo qua API; nên có một không gian cũ `driveFolderId = null` để thử nhánh tạo bù.

Duyệt kế hoạch: ☑ người dùng đã duyệt (2026-11-27), giữ phương án tách P3

## 3. Thực hiện + kiểm thử

| Phần | Commit | Test thêm | typecheck | lint | test | build |
|---|---|---|---|---|---|---|
| P1 | `5af49c8` | 15 (validation, drive-files) | ✅ | ✅ | ✅ 1459 | ✅ |
| P2 | `f868aad` | createDriveFile (google/drive-files.test) | ✅ | ✅ | ✅ 1526 | ✅ |
| P3 | `8b9e1c0` | 15 (drive-folder-sync) | ✅ | ✅ | ✅ 1526 | ✅ |
| P6 | `2ca0839` | query-keys, create-doc-api, create-doc-state, pending-tab | ✅ | ✅ | ✅ 1526 | ✅ |
| P4 | `68467f9` | 13 (drive-files createFile) | ✅ | ✅ | ✅ 1558 | ✅ |
| P5 | `4f9402b` | 19 (api/files POST) | ✅ | ✅ | ✅ 1558 | ✅ |
| P7 | `9836445` | — (không jsdom; logic test ở P6) | ✅ | ✅ | ✅ 1558 | ✅ |
| P8 | `a7b4e6a` | — (kiểm tay) | ✅ | ✅ | ✅ 1558 | ✅ |

Kiểm thật trên dev (2026-11-27, khung Browser của app, tài khoản đã kết nối Drive):
- Chưa có không gian trong DB → hộp thoại hiện trạng thái `no_spaces`. Tạo không gian "T017 thử" + "Dự án T017" qua API (thư mục Drive không gian được tạo).
- Tạo Doc "T017 Doc không gian" (chỉ không gian) và Sheet "T017 Sheet dự án" (có dự án): 201, liên kết Google đúng, hiện ngay ở `/docs` không tải lại; phụ đề Sheet "Dự án T017 · T017 thử". `GET /api/files?projectId=` chỉ trả Sheet, `?spaceId=` trả cả hai, `?kind=sheet` lọc đúng → file nằm đúng thư mục.
- Cú bấm tự động bị khung Browser chặn popup → nhánh `blocked`: hộp thoại hiện "Đã tạo …" + liên kết "Mở tài liệu" (`target=_blank`, `rel="noopener noreferrer"`).
- Người dùng tự bấm tạo một Slide → tab mới mở đúng file, hộp thoại đóng.
- `/docs` rỗng hiện nút "Tạo tài liệu" (P8). Console không lỗi.
- Chưa kiểm tay: nhánh tạo bù thư mục khi `driveFolderId = null` (chỉ có unit test).

## 4. Review code

Reviewer đã chạy (2026-11-27, trên `git diff develop...HEAD` @ `eb2207c`): `layer-reviewer`, `typescript-reviewer`, `security-reviewer`. Không có CRITICAL / HIGH. R1–R4 đã đọc code xác nhận.

| # | Mức | File:dòng | Vấn đề | Reviewer |
|---|---|---|---|---|
| R1 | MEDIUM | `src/components/layout/create-doc-dialog.tsx` (`useDocForm`, `submit`) | Mở từ trang dự án: trong lúc danh sách dự án đang tải, ô dự án khoá nhưng vẫn gửi được với `projectId = ""` → file lặng lẽ vào thư mục không gian. Tải dự án lỗi cũng vẫn gửi | typescript |
| R2 | MEDIUM | `src/components/layout/create-doc-api.ts` (`postDriveFile`) | Không có timeout / AbortSignal ở client; server có thể chạy > 30 s (tạo bù không gian + dự án + tạo file). Mạng treo → `busy` mãi, hộp thoại không đóng được, tab trống không đóng | typescript |
| R3 | MEDIUM | `src/components/layout/pending-tab.ts` (`finishPendingTab`) | `tab.location.href = url` không bọc try/catch; ném lỗi → `submit` reject sau khi file đã tạo, hộp thoại kẹt, dễ gửi lại tạo trùng | typescript |
| R4 | MEDIUM | `src/server/drive-files.ts` (`resolveTargetFolder`, `createFile`) | Hạn 10 s riêng từng bước, không có hạn tổng; quá hạn sau khi Google đã tạo file → 502, thử lại tạo bản trùng (cả nhánh `toDriveFileItem` → null) | typescript |
| R5 | MEDIUM | `src/server/http.ts` (`readJson`), mọi route POST | CSRF: không kiểm `Content-Type` / `Sec-Fetch-Site` / Origin. Vấn đề chung của repo (spaces, tasks, projects cùng khuôn), không riêng T017 | security |
| R6 | LOW | `create-doc-dialog.tsx` (`close`, nhánh thành công) | `onClose` truyền xuống là `close` có kiểm `busy`; chỉ đúng nhờ closure chụp lúc `busy = false` — mong manh khi refactor | typescript |
| R7 | LOW | `src/components/ui/modal.tsx` + hộp thoại | Focus đầu chỉ đặt lúc mở (trạng thái loading); khi form hiện, focus không vào ô Tên | typescript |
| R8 | LOW | `create-dialog.tsx` (`CreateDialog`) | `Suspense fallback={null}` → bấm Tạo có thể không thấy gì trong tích tắc | typescript |
| R9 | LOW | `create-doc-dialog.tsx` (`CreateDocForm`) | Hàm ~58 dòng, vượt ngưỡng 50 | layer |
| R10 | LOW | `src/server/projects.ts` ↔ `src/server/drive-folder-sync.ts` | `logDriveDbError` / `saveDriveFolderId` còn bản sao ở `projects.ts` | layer |
| R11 | LOW | `src/server/http.ts` (`handleUnexpected`) | Nhánh lỗi bất ngờ log `message` + `stack` (Prisma có thể chứa tham số); helper sẵn có | security |
| R12 | LOW | `POST /api/files` | Chưa giới hạn tần suất tạo file | security |
| R13 | LOW | `pending-tab.ts` | Tab `about:blank` có `opener` trong tích tắc trước khi gán `null` — đánh đổi có chủ đích | security |
| R14 | LOW | `create-doc-dialog.tsx` | Thứ tự mở tab / chặn đóng / nhánh bị chặn chỉ kiểm tay (không jsdom) | typescript |
| R15 | LOW | `docs/02`, `04`, `06` | Chưa cập nhật (thuộc P9 ở bước 7) | layer |

## 5. Fix bug

| Phát hiện | Xử lý | Commit |
|---|---|---|
| R1 | đã sửa: hàm thuần `requestedProjectWait` (loading / error / null); đang chờ dự án được yêu cầu → khoá "Tạo mới", lỗi tải → cảnh báo + Thử lại, ô dự án có lựa chọn "Chọn dự án…" để người dùng tự gỡ | `230f63b` |
| R2 | đã sửa: `postDriveFile` có `AbortSignal.timeout` 45 s (`CREATE_FILE_CLIENT_TIMEOUT_MS`), hết hạn → `CreateDocRequestError(…, 0, "timeout")` + câu nhắc xem Tài liệu gần đây | `230f63b` |
| R3 | đã sửa: gán `location.href` bọc try/catch → đóng tab, trả `blocked` (hiện liên kết) | `230f63b` |
| R4 | đã sửa một phần: log an toàn khi file vừa tạo không ánh xạ được; thông báo 502 (server + client) nhắc xem Tài liệu gần đây trước khi thử lại; JSDoc `createFile` ghi tổng ~30 s và rủi ro file mồ côi. Chưa thêm hạn tổng ở server (client đã có 45 s) → việc để sau | `230f63b` |
| R5 | bỏ qua: CSRF là vấn đề chung của mọi route POST (`readJson`), không riêng T017 → đề xuất nhiệm vụ riêng | — |
| R6 | đã sửa: `onCancel` (kiểm `busy`) cho Modal / Hủy, `onDone` (gốc) cho nhánh thành công và nút Đóng | `230f63b` |
| R7 | đã sửa: ô Tên `autoFocus` | `230f63b` |
| R8 | để sau (LOW): fallback `null` chỉ tích tắc | — |
| R9 | đã sửa: tách `useCreateDocSubmit` (`use-create-doc-submit.ts`), `CreateDocForm` ~40 dòng, `openPendingTab` vẫn chạy đồng bộ trước `await` | `230f63b` |
| R10 | đã sửa: `projects.ts` dùng `saveDriveFolderId` từ `drive-folder-sync.ts`, giữ chuỗi log và điều kiện where cũ | `230f63b` |
| R11 | để sau (LOW): helper chung `handleUnexpected`, không riêng T017 | — |
| R12 | để sau: rate limit thuộc T73 | — |
| R13 | bỏ qua: đánh đổi có chủ đích (tab `about:blank` do app mở) | — |
| R14 | để sau: chưa có jsdom; hành vi hộp thoại đã kiểm tay | — |
| R15 | sửa ở bước 7 (P9 docs) | — |

Kết quả 4 lệnh sau khi sửa: typecheck ✅ · lint ✅ · test ✅ 1575/1575 · build ✅. Test thêm: `requestedProjectWait` (7), timeout / 502 / timeout code (client), `href` ném lỗi (pending-tab), log nhánh không ánh xạ được (server).

## 6. Review lại

Vòng 1 (2026-11-27, `git diff 6290094..HEAD -- src`): `layer-reviewer`, `typescript-reviewer`, `security-reviewer`.
- Không có CRITICAL / HIGH / MEDIUM. R1–R4, R6, R7, R9, R10 xác nhận đã sửa đúng; `openPendingTab` vẫn đồng bộ trước `await`; timeout chỉ map khi `TimeoutError`; trạng thái chờ dự án luôn thoát được; log mới không chứa tên file / URL; `saveDriveFolderId` vẫn lọc `userId` ở mọi nơi gọi.
- LOW còn lại (để sau): câu "Không tải được dự án đã chọn" khi ID store không có trong DB (tự hết ở T59); test hằng số 45 s chỉ lặp giá trị; `isTimeout` dựa vào tên `TimeoutError` (Safari < 16 rơi vào câu chung).
- Sạch → sang bước 7.

## 7. Final

**Tóm tắt:** Ở chế độ `configured`, người dùng đã kết nối Drive tạo được Google Docs / Sheets / Slides trống trong thư mục Drive của không gian hoặc dự án qua hộp thoại "Tạo tài liệu"; file mở trong tab mới (bị chặn popup → liên kết "Mở tài liệu") và hiện ngay ở "Tài liệu gần đây" / `/docs`. Server: `POST /api/files` → `createFile` (lọc `userId`, dự án đúng không gian, tạo bù thư mục khi còn `null`) → `createDriveFile` (`files.create`, kiểm scope trước, hạn 10 s, log an toàn). Client: danh sách không gian / dự án lấy từ API, mở tab trước để tránh chặn popup, hạn 45 s, chặn gửi khi đang chờ dự án được yêu cầu. Tách phần tạo bù thư mục khỏi `projects.ts` sang `drive-folder-sync.ts`. Demo giữ nguyên. Test: 1459 → 1575.

**Tiêu chí nghiệm thu:** đạt cả 9 (đánh dấu ở mục 1; hai tiêu chí demo / chưa kết nối kiểm qua code + test, chưa chạy tay).

**Tài liệu đã cập nhật:** 02 (mục "Tạo Doc / Sheet / Slide (T017)", sửa ghi chú script dev), 04 (`drive-folder-sync.ts`, `createFile`, `createDriveFile`, file mới ở `components/layout`, `api/files` GET + POST), 06 (`POST /api/files`).

**Merge vào develop:** commit `a4b9f71`, 2026-11-27

**Sheet nhiệm vụ:** dòng T32 sẽ chuyển `Xong` sau merge (bước 7, mục 8; kết quả nêu trong báo cáo)

**Việc để sau:**
- R5 CSRF cho mọi route POST / PATCH / DELETE (`readJson`: bắt buộc `application/json`, từ chối `Sec-Fetch-Site: cross-site` / Origin lạ) — nhiệm vụ riêng hoặc gộp T73.
- R4 hạn tổng phía server cho `createFile` (hiện ~30 s tối đa, client 45 s); file mồ côi khi quá hạn.
- R12 rate limit `POST /api/files` (T73). R11 `handleUnexpected` bỏ `message` lỗi Prisma khỏi log.
- R8 fallback Suspense của hộp thoại; R14 test component (cần jsdom / RTL).
- LOW vòng review lại: câu "Không tải được dự án đã chọn" khi ID store không có trong DB (hết ở T59); test hằng số 45 s; `isTimeout` với Safari < 16.
- Nút "Tạo tài liệu" ở trang không gian / dự án truyền ID store → chọn không gian đầu tiên ở `configured` (T59).
- Xoá hoặc giữ `scripts/dev-create-doc.mjs` (không còn cần cho kiểm thật).
- Dữ liệu thử trên dev: không gian "T017 thử", "Dự án T017" và 3 file thử trên Drive — người dùng tự quyết giữ / xoá.
