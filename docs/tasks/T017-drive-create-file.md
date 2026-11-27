# T017 · Tạo Doc / Sheet / Slide trong thư mục Drive, mở tab mới tới file

| | |
|---|---|
| Nhánh | `feat/T017-drive-create-file` |
| Tạo từ | `develop` @ `2b64678` |
| Trạng thái | 3-build |
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
- [ ] Test hàm Drive tạo file với client giả: không scope → không gọi Drive, `not_connected`; tham số `files.create` đúng (mimeType theo loại, `parents`, `fields`); thiếu `id` → `error`; lỗi Gaxios → `error`, log không chứa token / URL; quá hạn → `error`.
- [ ] Test hàm truy vấn `createFile`: không gian / dự án của user khác → `not_found`; `projectId` không thuộc `spaceId` → `not_found`; thư mục dự án được chọn khi có `projectId`; thư mục `null` → tạo bổ sung và lưu `driveFolderId`; tạo bổ sung lỗi → `drive_error`, không gọi tạo file; trả `DriveFileItem` đúng tên không gian / dự án.
- [ ] Test route `POST /api/files`: 401, 503 (demo), 400 (thiếu tên, tên quá dài, `kind` sai, JSON hỏng), 404, 403 có `code`, 502, 201 đúng hình dạng.
- [ ] Test hàm thuần phía client (gọi API tạo file, chọn trạng thái hộp thoại, xử lý tab mở trước) — logic tách khỏi component vì không có jsdom.
- [ ] Chế độ demo: hộp thoại tạo tài liệu như cũ (ghi store), không gọi `/api/files` / `/api/spaces`.
- [ ] Chế độ `configured`, chưa kết nối Drive: hộp thoại hiện lời mời kết nối, không lỗi.
- [ ] Kiểm thật trên dev cùng người dùng: tạo một Doc, một Sheet, một Slide (ít nhất một cái trong dự án) → file nằm đúng thư mục `Taskeo / <không gian> [/ <dự án>]` trên Drive, tab mới mở đúng file, file hiện ở "Tài liệu gần đây" và `/docs` không cần tải lại trang.
- [ ] 4 lệnh typecheck / lint / test / build xanh.
- [ ] Docs 02, 04, 06 cập nhật.

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

Duyệt kế hoạch: ☐ chờ · ☐ người dùng đã duyệt (ngày) · ☐ bỏ qua (`--yes`)

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

**Sheet nhiệm vụ:** dòng T32 sẽ chuyển `Xong` sau merge (bước 7, mục 8; kết quả nêu trong báo cáo)

**Việc để sau:**
-
