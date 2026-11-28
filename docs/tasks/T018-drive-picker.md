# T018 · Google Picker: gắn file có sẵn trên Drive vào dự án

| | |
|---|---|
| Nhánh | `feat/T018-drive-picker` |
| Tạo từ | `develop` @ `9a22909` |
| Trạng thái | 7-final |
| Ngày tạo | 2026-11-27 |

Nguồn: sheet nhiệm vụ, dòng **T34** "Google Picker: gắn file có sẵn trên Drive vào dự án" (giai đoạn 4 · Google Drive, phụ thuộc T30 = T010). Sheet đã ở `Đang làm` khi khởi tạo, giữ nguyên.

## 1. Docs – yêu cầu

**Mục tiêu:** Ở chế độ `configured`, người dùng đã kết nối Google Drive bấm "Gắn file từ Drive", chọn không gian / dự án, mở **Google Picker** và chọn một file Google Docs / Sheets / Slides có sẵn trên Drive của mình → app tạo **lối tắt (shortcut) Drive** trỏ tới file đó trong thư mục `Taskeo / <không gian> [/ <dự án>]`. File gốc giữ nguyên chỗ cũ. Lối tắt hiện ở "Tài liệu gần đây", `/docs` (đúng bộ lọc loại) và mở thẳng file gốc.

**Quyết định (người dùng chọn 2026-11-27):** gắn bằng lối tắt trong thư mục Drive — không thêm bảng DB, không chuyển file gốc.

**Hiện trạng (2026-11-27, `develop` @ `9a22909`):**
- `AttachDriveDialog` (`features/projects/attach-drive-dialog.tsx`) chỉ dán liên kết, ghi store demo ở mọi chế độ. Nút mở ở `project-detail.tsx` (trang dự án đọc store demo; **ID store ≠ ID DB cho tới T59**).
- Server: scope `drive.file` (T010), thư mục không gian / dự án (`driveFolderId`, T013), `ensureSpaceFolderId` / `ensureProjectFolderId` tạo bù (T017), `createDriveFile` / `listDriveFiles` (`server/google/drive-files.ts`), `listFiles` / `createFile` (`server/drive-files.ts`), `buildDriveFilesQuery` + `toDriveFileItem` (`domain/drive-files.ts`, chỉ nhận 3 mimeType Google), `runWithDeadline`, `classifyDriveError`, `DRIVE_NOT_CONNECTED_CODE`.
- Client: hộp thoại tạo tài liệu configured (T017) đã có `use-create-doc-data.ts` (không gian / dự án từ API), `create-doc-api.ts`, `DRIVE_FILES_QUERY_KEY`, `DriveConnectPrompt`.
- Google Cloud: Picker API đã bật (sheet T03). Chưa có API key cho Picker, chưa có biến môi trường nào cho Picker. `docs/02` đã ghi ngoại lệ "route trả access token ngắn hạn cho Picker".

**Phạm vi:**
- **Cấu hình:** hai biến server tuỳ chọn `GOOGLE_PICKER_API_KEY` (API key giới hạn Picker API + HTTP referrer) và `GOOGLE_CLOUD_PROJECT_NUMBER` (app ID của Picker, để quyền `drive.file` gắn đúng app). Không thuộc 5 biến auth, thiếu thì không đổi chế độ chạy; chỉ Picker bị tắt. Ghi vào `.env.example`, `.env.production.example`, docs 01.
- **Route token Picker** `GET /api/drive/picker-token` → 200 `{ accessToken, expiresAt, developerKey, appId }` (access token còn hạn, refresh nếu cần qua `getGoogleAuth`) · 401 · 403 `drive_not_connected` · 503 demo / `code: "picker_not_configured"` thiếu biến · 502 refresh lỗi / quá hạn. `Cache-Control: no-store`. Không log token. Kiểm scope `drive.file` trước khi đụng token.
- **Server Drive:** hàm tạo lối tắt `files.create({ name, mimeType: shortcut, parents: [folderId], shortcutDetails: { targetId } })`; đọc file đích trước (`files.get` `id, name, mimeType, trashed`) để kiểm là Docs / Sheets / Slides và lấy tên. Cùng khuôn `ok` / `not_connected` / `error` / thêm `invalid_target` (không phải 3 loại, đã vào thùng rác, không truy cập được → 404/422), hạn 10 s, log an toàn.
- **Hàm truy vấn** `attachFile(userId, { driveFileId, spaceId, projectId? })`: không gian / dự án thuộc user, dự án đúng không gian; thư mục đích null → tạo bù (như `createFile`); đã có lối tắt tới cùng file trong thư mục đó (hoặc file gốc đã nằm trong thư mục) → 409 `code: "already_attached"`; trả `DriveFileItem` của lối tắt.
- **Liệt kê có lối tắt:** `buildDriveFilesQuery` / `listDriveFiles` / `toDriveFileItem` nhận cả mimeType shortcut, `fields` thêm `shortcutDetails(targetId,targetMimeType)`; lối tắt trỏ tới file không phải 3 loại thì bỏ; lọc `kind` áp lên `targetMimeType` (lọc sau khi lấy nếu `q` không lọc được); `url` mở file đích. `DriveFileItem` thêm cờ `shortcut: boolean` (hoặc tương đương) để UI ghi "Đã gắn".
- **Validation:** schema body `{ driveFileId (chuỗi ID Drive hợp lệ), spaceId, projectId? }` strict.
- **API** `POST /api/files/attach` (hoặc tương đương, planner chốt) → 201 `{ file }` · 400 · 401 · 403 `drive_not_connected` · 404 không gian / dự án / file đích · 409 `already_attached` · 502 · 503 demo.
- **Giao diện:**
  - Chế độ demo: `AttachDriveDialog` dán liên kết giữ nguyên.
  - `configured`: hộp thoại "Gắn file từ Drive" mới — chưa kết nối → lời mời kết nối; thiếu cấu hình Picker (503) → thông báo rõ; chọn không gian / dự án từ API (dùng lại `use-create-doc-data`); nút "Chọn từ Google Drive" nạp `https://apis.google.com/js/api.js` (một lần, chỉ khi bấm), lấy token, mở Picker (chỉ Docs / Sheets / Slides, `setAppId`, `setOAuthToken`, `setDeveloperKey`, một file); chọn xong → `POST` → thành công invalidate `DRIVE_FILES_QUERY_KEY`, thông báo "Đã gắn …", đóng; huỷ Picker → giữ hộp thoại; lỗi 409 / 404 / 502 → thông báo tiếng Việt.
  - Nút mở hộp thoại: trang dự án (truyền ID store; ở configured không khớp → chọn mặc định không gian đầu, như T017) và `/docs` (thêm nút "Gắn file từ Drive" cạnh "Tạo tài liệu").
  - "Tài liệu gần đây" / `/docs`: lối tắt hiện như file thường, kèm nhãn nhỏ "Đã gắn".
- Docs: 01 (biến mới), 02 (Picker, API key, app ID, lối tắt, ngoại lệ token), 04 (file mới), 06 (route mới, `GET /api/files` có lối tắt).

**Ngoài phạm vi:**
- Gắn file vào công việc / bảng `TaskFile` (T60).
- Gỡ lối tắt (bỏ gắn), đổi tên lối tắt, chọn nhiều file một lần, chọn thư mục, file không phải Docs / Sheets / Slides (PDF, ảnh…).
- Nối trang dự án / tab Tài liệu ở trang không gian vào API (T59).
- CSP cho `apis.google.com` / `docs.google.com` (T73 — ghi vào việc để sau khi bật CSP), rate limit (T73).
- Tạo API key trên Google Cloud Console: **người dùng tự làm** (hướng dẫn trong docs 02) trước bước kiểm thật.

**Tiêu chí nghiệm thu** (mỗi dòng kiểm tra được):
- [ ] Test route token: 401; 503 demo (không import động); 503 `picker_not_configured` khi thiếu một trong hai biến; 403 `drive_not_connected` không đụng token; 502 khi lấy token lỗi / quá hạn; 200 đúng hình dạng + `Cache-Control: no-store`; log không chứa token.
- [ ] Test hàm Drive tạo lối tắt (client giả): không scope → không gọi Drive; đọc đích rồi `files.create` đúng `mimeType` shortcut, `parents`, `shortcutDetails.targetId`, tên = tên file đích, có `signal`; đích là thư mục / PDF / đã vào thùng rác / 404 → `invalid_target`, không tạo; lỗi Gaxios → log sạch; quá hạn → `error`.
- [ ] Test `attachFile`: không gian / dự án của user khác → `not_found`; dự án khác không gian → `not_found`; thư mục dự án được chọn; thư mục null → tạo bù; tạo bù lỗi → `drive_error`, không tạo lối tắt; đã gắn → `already_attached`, không tạo; trả `DriveFileItem` đúng tên không gian / dự án, cờ lối tắt.
- [ ] Test liệt kê: `q` có mimeType shortcut; lối tắt tới Docs / Sheets / Slides → item với `kind` theo đích và `url` mở đích; lối tắt tới loại khác → bỏ; lọc `kind` đúng với lối tắt; test cũ của `GET /api/files` còn xanh.
- [ ] Test route `POST` gắn: 401, 503, 400 (thiếu / sai `driveFileId`, khoá lạ, JSON hỏng), 404, 403, 409, 502, 201.
- [ ] Test hàm thuần phía client: nạp script một lần (loader với `document` giả), dựng cấu hình Picker từ token, xử lý kết quả Picker (picked / cancel / không có file), thông báo lỗi theo mã.
- [ ] Chế độ demo: "Gắn file từ Drive" vẫn là dán liên kết, không gọi `/api/drive/picker-token` / `/api/files/attach`, không nạp script Google.
- [ ] Kiểm thật trên dev cùng người dùng (sau khi người dùng tạo API key + đặt 2 biến): chọn một Doc có sẵn ngoài thư mục Taskeo → lối tắt nằm đúng thư mục dự án trên Drive, file gốc không đổi chỗ, mục mới hiện ở "Tài liệu gần đây" và `/docs` (đúng bộ lọc loại) với nhãn "Đã gắn", bấm mở đúng file gốc; gắn lại cùng file → báo đã gắn.
- [ ] 4 lệnh typecheck / lint / test / build xanh.
- [ ] Docs 01, 02, 04, 06 cập nhật.

**Tài liệu bị ảnh hưởng:** 01 môi trường · 02 Google · 04 kiến trúc · 06 API.

## 2. Kế hoạch từng phần

| Phần | Việc | File | Agent | Test cần viết |
|---|---|---|---|---|
| P1 | **Domain.** `types.ts`: `DriveFileItem.shortcut: boolean`, `PickerTokenResponse { accessToken; expiresAt: string \| null; developerKey; appId }`, `AttachFileResponse { file }`. `validation.ts`: `DRIVE_FILE_ID_PATTERN` (`^[A-Za-z0-9_-]{10,128}$`), `driveFileIdSchema`, `attachFileInputSchema` (strict `{ driveFileId, spaceId, projectId? }`, `projectId` rỗng → undefined). `drive-files.ts`: `DRIVE_SHORTCUT_MIME`, `SHORTCUT_KIND_PROPERTY = "taskeoTargetKind"`, mã `ALREADY_ATTACHED_CODE` / `INVALID_TARGET_CODE` / `PICKER_NOT_CONFIGURED_CODE`, `driveEditUrl(kind, id)`, `mimeClause` nhận lối tắt (QĐ1), `buildShortcutLookupQuery(targetId, parentId)`, `RawDriveFile.shortcutDetails`, `pickRawDriveFile`, `toDriveFileItem` cho lối tắt (`kind` theo `targetMimeType`, khác 3 loại → bỏ, `url = driveEditUrl`, `shortcut: true`), `isDriveFileItem` dùng chung, `DRIVE_SHORTCUT_CREATE_FIELDS`, `DRIVE_TARGET_FIELDS`. Ngoại lệ vùng: thêm `shortcut: false` vào fixture 5 file test | `src/domain/{types,validation,drive-files}.ts` (+test); fixture `src/app/api/files/route.test.ts`, `src/server/drive-files.test.ts`, `src/components/layout/create-doc-api.test.ts`, `src/features/docs/{drive-files-api,drive-files-state}.test.ts` | feature-builder | schema `driveFileId` (thiếu / rỗng / `/` / quá dài / NUL), khoá lạ, `projectId` rỗng; `q` có shortcut khi có / không `kind`, giá trị đã thoát; `buildShortcutLookupQuery` thoát `'` `\`; `toDriveFileItem` lối tắt Doc / Sheet / Slide → đúng `kind` + url qua `isDriveUrl`, PDF / thư mục / thiếu `shortcutDetails` → `null`; `driveEditUrl`; `isDriveFileItem` |
| P2 | `DRIVE_LIST_FIELDS` thêm `shortcutDetails(targetId,targetMimeType)`; thay `toRawDriveFile` bằng `pickRawDriveFile`. `createDriveFile` giữ nguyên | `src/server/google/drive-files.ts` (+test) | google-integrator | `fields` có `shortcutDetails`; trường thừa bị cắt; test cũ xanh |
| P3 | `attachDriveShortcut(userId, { targetId, parentId }, deps)` → `ok {file}` / `not_connected` / `invalid_target` / `already_attached` / `error`, một `runWithDeadline` 10 s: kiểm scope → `getDrive` → `files.get` đích (404 / 403 → `invalid_target`, 403 log riêng vì thường do sai appId; trashed / không phải 3 loại → `invalid_target`) → đích đã nằm trong thư mục → `already_attached` → `files.list(buildShortcutLookupQuery, pageSize 1)` có → `already_attached` → `files.create` shortcut (`name = toDriveFileName(target.name)`, `parents`, `shortcutDetails.targetId`, `appProperties.taskeoTargetKind`, `signal`); thiếu id → `error`. Không ném. `DriveFilesClient` thêm `files.get` | `src/server/google/drive-shortcuts.ts` (+test), `src/server/google/drive-folders.ts` | google-integrator | không scope → không `getDrive`; tham số `create` đúng; thư mục / PDF / trashed / 404 / 403 → `invalid_target`, không `create`; đã ở thư mục / đã có lối tắt → `already_attached`; thiếu id; Gaxios → log sạch (không token / URL / tên file); `GoogleNotConnectedError`; quá hạn |
| P4 | `config/env.ts`: `PICKER_ENV_VARS`, `readPickerConfig(env)` → `{ developerKey, appId } \| null` (trim, appId chỉ chữ số; không đụng `AUTH_ENV_VARS` / `getAuthMode`). `picker-token.ts`: `getPickerAccessToken(userId, deps)` → `ok { accessToken, expiresAt }` / `not_connected` / `error`; kiểm scope trước, import động `./client` → `getGoogleAuth().getAccessToken()` (tự refresh, lưu DB), hạn 10 s, log không token. `.env.example`, `.env.production.example`: 2 biến rỗng + chú thích | `src/config/env.ts` (+test), `src/server/google/picker-token.ts` (+test), `.env.example`, `.env.production.example` | google-integrator | `readPickerConfig` đủ / thiếu / khoảng trắng / appId có chữ; không scope → không import client; `expiresAt` ISO / `null`; token rỗng; lỗi refresh log sạch; quá hạn |
| P5 | `listFiles` lọc lại `kind` sau ánh xạ. `loadCreateTarget` nhận `{ spaceId, projectId? }`; tách `toTargetItem` dùng chung. `attachFile(userId, input, deps)` → `ok` / `not_found` / `invalid_target` / `already_attached` / `drive_not_connected` / `drive_error`: target thuộc user → `resolveTargetFolder` (tạo bù) → P3 | `src/server/drive-files.ts` (+test) | api-builder | user khác / dự án khác không gian → `not_found`; thư mục dự án; null → tạo bù; tạo bù lỗi → không gọi P3; chưa scope khi cần tạo bù → `drive_not_connected`; truyền `already_attached` / `invalid_target`; đúng tên, `shortcut: true`; lọc `kind`; test `createFile` cũ xanh |
| P6 | `GET /api/drive/picker-token` theo khuôn `drive/storage`: `connection()` → `getApiUserId` (401 / 503) → `readPickerConfig` (null → 503 `picker_not_configured`) → import động P4 → 200 · 403 · 502. Mọi phản hồi `Cache-Control: no-store` | `src/app/api/drive/picker-token/route.ts` (+test) | api-builder | 401; 503 demo không import động; 503 code khi thiếu từng biến; 403 không gọi token; 502; 200; `no-store` cả lỗi; log không token |
| P7 | `POST /api/files/attach` → 201 `{ file }` · 400 · 401 · 403 `drive_not_connected` · 404 không gian / dự án · 404 `invalid_target` · 409 `already_attached` · 502 · 503 · 500 | `src/app/api/files/attach/route.ts` (+test) | api-builder | 401; 503; 400 (thiếu / sai `driveFileId`, khoá lạ, JSON hỏng); 404 hai loại; 403; 409; 502; 201 |
| P8 | Refactor client dùng chung, không đổi hành vi T017: tách ô chọn không gian / dự án + trạng thái tải / lỗi ra `drive-placement-fields.tsx`, logic chọn ra `use-drive-placement.ts`; `create-doc-api.ts` export `requestJson` + `fileFromBody`, dùng `isDriveFileItem` của domain | `src/components/layout/{create-doc-dialog.tsx,create-doc-api.ts,drive-placement-fields.tsx,use-drive-placement.ts}` | feature-builder | test `create-doc-*` cũ xanh; `fileFromBody` từ chối thiếu `shortcut` |
| P9 | Hàm thuần client: `google-picker.ts` (kiểu tối thiểu viết tay, `loadPickerScript({ doc, getGapi, timeoutMs })` gắn script một lần, lỗi thì thử lại được; `buildPickerOptions`; `openPicker` với `DocsView` 3 mime, không thư mục, không multiselect, trả `dispose`; `parsePickerResult` → picked / cancel / ignore / invalid). `attach-doc-api.ts`: `fetchPickerToken`, `postAttachFile` (hạn 45 s), `buildAttachFileBody`. `attach-doc-state.ts`: `attachDialogState`, `attachErrorMessage` | `src/components/layout/{google-picker,attach-doc-api,attach-doc-state}.ts` (+test) | feature-builder | loader với `document` giả (2 lần gọi đồng thời → 1 script; onerror → gọi lại được; gapi sẵn → không gắn; timeout); options; builder giả đủ setter; parse các nhánh; fetch giả 200 / 503 code / 403 / JSON hỏng / thiếu trường; body; bảng thông báo |
| P10 | Hộp thoại configured `DriveAttachDocDialog` + `use-attach-doc.ts`: chưa kết nối → lời mời; ô chọn từ P8; bấm "Chọn từ Google Drive" → nạp script + lấy token song song → Picker; picked → POST → invalidate `DRIVE_FILES_QUERY_KEY`, "Đã gắn “…”", đóng; huỷ → giữ; lỗi → thông báo trong hộp thoại; đang chọn / gửi → không đóng được, khoá ô; unmount → `dispose`. `ui-context.tsx`: `CreateRequest { kind: "attach" }`. `create-dialog.tsx`: `attach` → demo `null`, configured → hộp thoại mới | `src/components/layout/{attach-doc-dialog.tsx,use-attach-doc.ts,ui-context.tsx,create-dialog.tsx}` | feature-builder | không jsdom → logic test ở P9; kiểm tay |
| P11 | `attach-drive-button.tsx` + hàm thuần `attachEntryAction(isDemo, hasDemoHandler)`. `project-detail.tsx`: demo → `AttachDriveDialog` cũ, configured → `openCreate({ kind: "attach", … })`. `docs-view.tsx`: nút cạnh "Tạo tài liệu", ẩn ở demo. `file-row.tsx`: nhãn "Đã gắn". `drive-files-api.ts`: dùng `isDriveFileItem`. `attach-drive-dialog.tsx`: sửa câu thành câu chế độ demo | `src/features/docs/{attach-drive-button.tsx,docs-view.tsx,file-row.tsx,drive-files-api.ts}` (+test), `src/features/projects/{project-detail,attach-drive-dialog}.tsx` | feature-builder | `attachEntryAction` 3 nhánh; `fetchDriveFiles` từ chối thiếu `shortcut`; còn lại kiểm tay |
| P12 | Docs 01 (2 biến), 02 (Picker, tạo API key + giới hạn referrer, project number = appId, lối tắt + `appProperties`, sửa câu "token chỉ có scope `drive.file`"), 04 (file mới), 06 (2 route mới, `GET /api/files` có lối tắt) | `docs/0{1,2,4,6}-*.md` | tự làm | không |

Thứ tự: P1 → (P2 ∥ P3 ∥ P4 ∥ P8) → (P5 ∥ P6 ∥ P9) → (P7 ∥ P10) → P11 → kiểm thật cùng người dùng → P12.

Quyết định thiết kế:
- **Lọc `kind` với lối tắt:** Drive `q` không lọc được theo `shortcutDetails.targetMimeType`. Khi tạo lối tắt, gắn `appProperties.taskeoTargetKind`; với `drive.file` mọi lối tắt app thấy đều do app tạo. Có `kind`: `(mimeType='<mime>' or (mimeType='<shortcut>' and appProperties has {…'<kind>'}))`; không `kind`: thêm `or mimeType='<shortcut>'`. `targetMimeType` vẫn là chuẩn, `listFiles` lọc lại.
- **URL:** dựng từ `targetId` + `targetMimeType` (`docs.google.com/{document|spreadsheets|presentation}/d/<id>/edit`), qua `isDriveUrl`; không dùng `webViewLink` của lối tắt.
- **Đã gắn:** đích đã nằm trong thư mục, hoặc đã có lối tắt cùng `targetId` trong thư mục → 409. Hai request đồng thời vẫn có thể tạo trùng: chấp nhận.
- **Phản hồi:** `id` = id lối tắt, `modifiedAt` = lúc gắn, `shortcut: boolean` bắt buộc. Đích lỗi → 404 `code: "invalid_target"`.
- **Luật lớp:** hộp thoại / loader / API client ở `components/layout`, mở qua `openCreate({ kind: "attach" })`; `features` chỉ có nút. Demo không bao giờ gọi token / attach hay nạp script. Không dùng `next/script`: chỉ nạp khi bấm.
- **Token lấy khi bấm**, không lấy sẵn lúc mở hộp thoại. Không thêm bảng DB, không ghi Activity, không bật Shared drives.

Rủi ro / phụ thuộc:
- **Người dùng tự làm trước kiểm thật:** tạo API key trong cùng project với OAuth client (giới hạn Google Picker API + referrer `http://localhost:3000/*` và domain production); lấy **project number**; đặt `GOOGLE_PICKER_API_KEY`, `GOOGLE_CLOUD_PROJECT_NUMBER` vào `.env.local`, khởi động lại dev.
- Sai appId → Picker chọn được nhưng `files.get` 404 / 403 → `invalid_target` (log riêng 403, docs 02 ghi cách xử lý).
- Token đưa ra trình duyệt mang **mọi scope đã cấp** (sau này cả Calendar). Giảm thiểu: `no-store`, không log, sống ~1 giờ, chỉ lấy khi bấm.
- `q` kết hợp `appProperties has` + `or` + `shortcutDetails.targetId` cần xác nhận khi kiểm thật (2026-11-28: `has` + `or` chạy được; `shortcutDetails.targetId` + `in parents` bị 400 → R16); dự phòng: liệt kê lối tắt trong thư mục rồi lọc trong code. `q` dài hơn khi lọc 40 thư mục cha → giảm `DRIVE_PARENTS_PER_QUERY` nếu Drive báo lỗi.
- Tên lối tắt không tự đổi khi file gốc đổi tên; `modifiedAt` là giờ gắn.
- Refresh token bị thu hồi → route token 502 (như T017). Gắn tối đa ~30 s, client hạn 45 s; quá hạn sau `create` → gắn lại báo 409.
- Trình chặn quảng cáo có thể chặn `apis.google.com` → `script_load_failed`. CSP để T73.
- Picker là iframe đè lên `Modal`: khoá đóng hộp thoại lúc đang chọn; chỉ kiểm tay.
- P1 sửa fixture ở vùng agent khác (chỉ thêm `shortcut: false`, chạy trước mọi phần). P8 refactor `create-doc-dialog.tsx`: chạy lại test `create-doc-*` và kiểm tay hộp thoại tạo tài liệu.

Duyệt kế hoạch: ☐ chờ · ☑ người dùng đã duyệt (2026-11-27) · ☐ bỏ qua (`--yes`)

## 3. Thực hiện + kiểm thử

| Phần | Commit | Test thêm | typecheck | lint | test | build |
|---|---|---|---|---|---|---|
| P1 | `80f6788` | validation (driveFileId, attachFileInput), drive-files (q lối tắt, driveEditUrl, shortcut lookup, toDriveFileItem lối tắt, isDriveFileItem, pickRawDriveFile) | ✅ | ✅ | ✅ 1647 | ✅ |
| P2 | `7d00fb8` | drive-files.test (fields shortcutDetails, cắt trường thừa) | ✅ | ✅ | ✅ 1714 | ✅ |
| P3 | `a7d3e35` | drive-shortcuts.test (26 test: scope, invalid_target, already_attached, log sạch, quá hạn) | ✅ | ✅ | ✅ 1714 | ✅ |
| P4 | `2f20714` | env.test (readPickerConfig), picker-token.test (16 test) | ✅ | ✅ | ✅ 1714 | ✅ |
| P8 | `0c905d3` | create-doc-api.test (fileFromBody shortcut, requestJson) | ✅ | ✅ | ✅ 1714 | ✅ |
| P5 | `3fbaf2f` | drive-files.test (attachFile 14 test, listFiles lọc lại kind) | ✅ | ✅ | ✅ 1829 | ✅ |
| P6 | `7f022ba` | picker-token/route.test (12 test, no-store mọi phản hồi) | ✅ | ✅ | ✅ 1829 | ✅ |
| P9 | `da1fa73` | google-picker.test (34), attach-doc-api.test (30), attach-doc-state.test (23) | ✅ | ✅ | ✅ 1829 | ✅ |
| P7 | `e1f987b` | files/attach/route.test (25 test) | ✅ | ✅ | ✅ 1860 | ✅ |
| P10 | `df593d1` | attach-doc-state.test (isAttachBusy, attachButtonLabel) | ✅ | ✅ | ✅ 1860 | ✅ |
| P11 | `7c7c1c0` | attach-entry.test (3 nhánh), drive-files-api.test (shortcut, url lạ) | ✅ | ✅ | ✅ 1867 | ✅ |

## 4. Review code

Reviewer đã chạy: `layer-reviewer`, `typescript-reviewer`, `security-reviewer` trên `git diff develop...HEAD` @ `6ecb3da` (trước P12). Không có CRITICAL / HIGH.

| # | Mức | File:dòng | Vấn đề | Reviewer |
|---|---|---|---|---|
| R1 | MEDIUM | `components/layout/attach-doc-api.ts:45`, `use-attach-doc.ts:44,114`, `attach-doc-dialog.tsx:117` | `fetchPickerToken` không có hạn phía client; pha `opening` khoá Esc / bấm ngoài / Hủy → mạng treo hoặc Picker không gọi callback thì kẹt "Đang mở Google Drive…", phải tải lại trang | typescript |
| R2 | MEDIUM | `server/google/drive-shortcuts.ts:73` | Mọi 403 từ `files.get` → `invalid_target`; 403 còn là `rateLimitExceeded` / `userRateLimitExceeded` → người dùng thấy "không mở được file / sai appId", log chẩn đoán sai | typescript |
| R3 | MEDIUM | `server/google/drive-shortcuts.ts:66` | `files.get` có `supportsAllDrives: true`, khác mọi lời gọi Drive khác và trái quyết định "không bật Shared drives" | layer |
| R4 | MEDIUM | `server/google/picker-token.ts:36`, `docs/02:133` | Token ra trình duyệt mang mọi scope đã cấp; docs 02 còn ghi "chỉ có scope `drive.file`" | security |
| R5 | MEDIUM | `components/layout/google-picker.ts:104` | Script bên thứ ba `apis.google.com` chạy cùng origin, chưa có CSP (đã hoãn T73) | security |
| R6 | LOW | `components/layout/use-attach-doc.ts:121` | Nhánh thành công không `session.end()`, chỉ dựa vào `onDone` unmount | typescript |
| R7 | LOW | `components/layout/use-attach-doc.ts:44,114` | `end()` không abort fetch token đang bay (script lỗi trước → token vẫn chạy) | typescript |
| R8 | LOW | `components/layout/google-picker.ts:217` | `entry[0] as DocKind` ép kiểu; domain đã có `docKindFromMime` | typescript |
| R9 | LOW | `features/docs/file-row.tsx:26`, `components/layout/use-attach-doc.ts:128` | Chữ "Đã gắn" viết cứng hai nơi, không có trong `domain/labels.ts` | layer |
| R10 | LOW | `domain/drive-files.ts` (`resolveTarget`), `server/drive-files.ts` | Lối tắt có file đích đã vào thùng rác / mất quyền vẫn được liệt kê (`trashed=false` áp lên lối tắt) | typescript |
| R11 | LOW | `app/api/drive/picker-token/route.ts:63` | Không rate limit, mỗi lần gọi có thể refresh token | security |
| R12 | LOW | `server/google/drive-shortcuts.ts:111` | Kiểm-rồi-tạo không nguyên tử, gắn đồng thời có thể trùng | security |
| R13 | LOW | `app/api/files/attach/route.ts:61` | `not_found` chọn câu theo có `projectId` hay không | layer |
| R14 | LOW | `features/projects/project-detail.tsx:147` | `features/projects` import `AttachDriveButton` từ `features/docs` (như `FileRow` đã làm) | layer |
| R15 | LOW | `.env.*.example`, docs 02 | Hướng dẫn giới hạn API key chưa có trong docs 02 | security |

## 5. Fix bug

| Phát hiện | Xử lý | Commit |
|---|---|---|
| R1 | đã sửa: `fetchPickerToken` hạn 15 s (gộp signal ngoài + `AbortSignal.timeout`, hết hạn → code `timeout`); pha `loading` / `picking` / `attaching`, `canDismissAttach`: đang nạp script / lấy token thì Esc / Hủy đóng được (abort fetch, không mở Picker muộn) | `2787a46` |
| R2 | đã sửa: `driveErrorReason` đọc `reason` (danh sách cố định); 403 rate limit / quota → `error` (502), 403 còn lại → `invalid_target` | `2787a46` |
| R3 | đã sửa: bỏ `supportsAllDrives` ở `files.get` | `2787a46` |
| R4 | đã sửa ở P12: docs 02 ghi đúng token mang mọi scope đã cấp + biện pháp giảm thiểu | `84ad8f2` |
| R5 | để sau: CSP `script-src https://apis.google.com https://www.gstatic.com`, `frame-src https://docs.google.com` làm cùng T73 (đã ghi docs 02) | — |
| R6 | đã sửa: thành công → `session.end()` trước `onDone()` | `2787a46` |
| R7 | đã sửa: `end()` abort fetch đang bay | `2787a46` |
| R8 | đã sửa: dùng `docKindFromMime` của domain | `2787a46` |
| R9 | đã sửa: `ATTACHED_LABEL` / `ATTACHED_TITLE` trong `domain/labels.ts` | `2787a46` |
| R10 | để sau: lối tắt có file đích đã xoá vẫn hiện (ghi việc để sau) | — |
| R11 | để sau: rate limit ở T73 | — |
| R12 | bỏ qua: chấp nhận (UI khoá khi gửi, chỉ tạo rác trong Drive của chính user) | — |
| R13 | bỏ qua: cả hai trường hợp đều 404 đúng, câu đủ rõ | — |
| R14 | bỏ qua: cùng tiền lệ `FileRow`, ESLint không cấm | — |
| R15 | đã sửa ở P12: docs 02 có mục tạo + giới hạn API key | `84ad8f2` |
| R16 (kiểm thật) | đã sửa: gắn file ngoài Taskeo → 502. Drive trả 400 `Invalid Value` (`location: q`) khi gộp `shortcutDetails.targetId` với `'<thư mục>' in parents` (tái hiện bằng Drive REST trên dev 2026-11-28). Lookup giờ chỉ lọc `targetId` + `trashed=false`, lấy `parents` rồi lọc trong code; log lỗi thêm `step` (get / lookup / create) và reason 400. Đã xác nhận `files.create` lối tắt kèm `appProperties` và truy vấn `has` + `or` chạy được | `c7b08ae` |

Kết quả 4 lệnh sau khi sửa: typecheck ✅ · lint ✅ · test ✅ 1914 · build ✅

Sau R16 (`c7b08ae`): typecheck ✅ · lint ✅ · test ✅ 1926 · build ✅

## 6. Review lại

Vòng 1 (`git diff a16d0ba..HEAD`, sau `2787a46`): `layer-reviewer`, `typescript-reviewer`, `security-reviewer` đều **sạch** — R1–R3, R6–R9 sửa đúng, không có CRITICAL / HIGH / MEDIUM mới. Ghi nhận LOW (để sau, không sửa):
- Pha `picking` vẫn khoá Esc / Hủy và không có hạn: nếu iframe Picker lỗi mà không gọi callback thì phải tải lại trang (chấp nhận vì Picker đè lên Modal).
- `driveErrorReason`: reason lạ ở `response` thì không thử `errors[0]` (an toàn, chỉ mất trường chẩn đoán).
- Referrer API key chưa gồm domain Vercel preview (preview hiện bị chặn truy cập nên không ảnh hưởng).
- Trình bày: comment dài ở `use-attach-doc.ts:22`, ternary thừa ở `drive-shortcuts.ts` `logFields`.

## 7. Final

**Tóm tắt:**

**Tiêu chí nghiệm thu:** (đánh dấu ở mục 1)

**Tài liệu đã cập nhật:**

**Merge vào develop:** commit `<hash>`, ngày

**Sheet nhiệm vụ:** dòng T34 sẽ chuyển `Xong` sau merge (bước 7, mục 8; kết quả nêu trong báo cáo)

**Việc để sau:**
-
