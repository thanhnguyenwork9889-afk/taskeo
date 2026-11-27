# T015 · Liệt kê file Drive theo không gian / dự án + Tài liệu gần đây

| | |
|---|---|
| Nhánh | `feat/T015-drive-file-listing` |
| Tạo từ | `develop` @ `6074fb4` |
| Trạng thái | 4-review |
| Ngày tạo | 2026-11-27 |

Nguồn: sheet nhiệm vụ, dòng **T33** "Liệt kê file theo không gian/dự án + Tài liệu gần đây" (giai đoạn 4 · Google Drive). Phụ thuộc T31 (thư mục Drive cho không gian / dự án, xong ở T013). Trạng thái trên sheet đã là `Đang làm` từ trước, giữ nguyên.

Commit đầu nhánh `1776cab` (người dùng chọn): đồng bộ `package-lock.json` với `engines` trong `package.json` và thêm `.idea/` vào `.gitignore` — không thuộc nội dung T33.

## 1. Docs – yêu cầu

**Mục tiêu:** Người dùng đã kết nối Google Drive thấy file Google Docs / Sheets / Slides thật trong thư mục Drive của Taskeo: danh sách "Tài liệu gần đây" ở Tổng quan và trang Kho lưu trữ `/docs` (lọc theo loại `?type=`). Server có API liệt kê file theo không gian / dự án để các tab Tài liệu dùng khi giao diện chuyển sang dữ liệu thật.

**Hiện trạng (2026-11-27, `develop` @ `6074fb4`):**
- `Space.driveFolderId` / `Project.driveFolderId` được ghi khi tạo qua API (T013). Thư mục: `Taskeo / <không gian> / <dự án>`, gắn `appProperties` `taskeoRole` = `root` / `space` / `project`.
- Scope `drive.file`: app chỉ thấy file do app tạo hoặc người dùng mở bằng app. Tạo Doc/Sheet/Slide là T32 (chưa làm); người dùng có thể tự tạo file trong thư mục Taskeo trên Drive nhưng app **không** thấy file đó với `drive.file` — chỉ thấy file app tạo / mở. Kiểm thật vì vậy cần một file do app tạo (script dev tạo một Doc trống bằng `files.create` trong thư mục không gian), hoặc làm sau T32.
- Giao diện chạy store demo (localStorage) ở mọi chế độ. ID không gian / dự án trong store **không trùng** ID trong DB cho tới T59. `recent-docs-card.tsx`, `docs-view.tsx`, tab Tài liệu ở `space-detail.tsx` / `project-detail.tsx` đọc `files` từ store.
- `useViewer()` (client) có `isDemo`, `driveConnected`. `@tanstack/react-query` đã có trong `package.json` nhưng chưa có `QueryClientProvider`.
- Hạ tầng sẵn có: `getGoogleAuth`, `hasGoogleScope`, `classifyDriveError` / `driveErrorLogFields`, `escapeDriveQueryValue`, mẫu route `GET /api/activities` (`connection()` → `getApiUserId()` → Zod → import động).

**Phạm vi:**
- **Server Drive** (`src/server/google/`, `server-only`): hàm liệt kê file với `files.list`, `q` = mimeType thuộc 3 loại Google (`document`, `spreadsheet`, `presentation`) + `trashed=false` (+ điều kiện `'<folderId>' in parents` khi lọc), `orderBy: modifiedTime desc`, `fields` chỉ gồm `id, name, mimeType, modifiedTime, webViewLink, parents`, `pageSize` = `limit`. Timeout + `retry: false` như `drive-provision.ts`; chỉ import động `client` / `googleapis` sau khi thấy scope.
- **Hàm thuần** (`src/domain/`, có test): mimeType → `DocKind`; dựng chuỗi `q` (thoát giá trị); ánh xạ file Drive → bản ghi phía client theo `parents` khớp `driveFolderId` của không gian / dự án của user (file trong thư mục dự án → cả `projectId` lẫn `spaceId`); bỏ file thiếu `id` / mimeType lạ; chỉ giữ `webViewLink` qua `isDriveUrl`.
- **Hàm truy vấn** `src/server/drive-files.ts` (hoặc tên tương tự): đọc không gian / dự án của user (lọc `userId`), gọi Drive, ánh xạ.
  - Tài liệu gần đây (không lọc): file mới sửa nhất mà app thấy, **chỉ giữ file nằm trong thư mục không gian / dự án của user** (file ngoài thư mục Taskeo bị bỏ qua).
  - Lọc theo `spaceId`: file trong thư mục không gian **và** trong thư mục các dự án của nó. Lọc theo `projectId`: chỉ thư mục dự án. Không gian / dự án không thuộc user → 404; chưa có `driveFolderId` → danh sách rỗng, không gọi Google.
  - Lọc theo `kind` (`doc` / `sheet` / `slide`).
- **API** `GET /api/files?spaceId=&projectId=&kind=&limit=` (`limit` 1–100, mặc định 20; `spaceId` và `projectId` không dùng cùng lúc; key lặp → 400). Phản hồi 200 `{ data: { files: DriveFileItem[] } }`, mỗi file có `id, name, kind, url, modifiedAt, spaceId, projectId, spaceName, projectName` (tên để giao diện không phải tra store). Chưa kết nối Drive / thiếu scope → mã lỗi riêng để giao diện hiện lời mời kết nối (planner chọn: 403 kèm `code: "drive_not_connected"` hoặc 200 với cờ). Google lỗi / quá hạn → 502 thông báo chung, log một dòng không token / URL. 401 / 503 như các route khác.
- **Giao diện (chế độ `configured`):**
  - `QueryClientProvider` trong app shell (client), hook `useDriveFiles({ spaceId?, projectId?, kind?, limit? })` gọi `/api/files`, `staleTime` hợp lý (vd 60 s), không retry khi 4xx.
  - `RecentDocsCard` và `DocsView`: chế độ demo giữ nguyên dữ liệu store; `configured` + đã kết nối Drive → dữ liệu thật, phụ đề `dự án · không gian` lấy từ `spaceName` / `projectName`; có trạng thái đang tải, rỗng, lỗi (nút thử lại); chưa kết nối Drive → lời mời kết nối Drive thay cho danh sách.
  - `FileRow` mở `url` thật trong tab mới; câu "Tài liệu mẫu — giai đoạn 3…" chỉ còn ở chế độ demo. Ô tìm kiếm (`useUI().query`) vẫn lọc theo tên trên dữ liệu thật.
  - Sửa dòng chú thích cuối `docs-view.tsx` cho đúng hiện trạng.
- Docs: 02 (liệt kê file với `drive.file`), 04 (file mới), 06 (`GET /api/files`).

**Ngoài phạm vi:**
- Tab Tài liệu ở `space-detail.tsx` / `project-detail.tsx` và ô đếm "Tài liệu" ở thẻ không gian: vẫn đọc store, vì ID store không khớp ID DB cho tới T59. API đã hỗ trợ lọc `spaceId` / `projectId` để T59 nối thẳng.
- Tạo Doc/Sheet/Slide (T32), Google Picker (T34), gắn file vào công việc (T60), tìm tên file ở Ctrl+K (T44).
- Phân trang quá `limit` (nextPageToken), cache phía server, rate limit (T73).
- Thay store demo bằng TanStack Query cho không gian / dự án / công việc (T59).

**Tiêu chí nghiệm thu** (mỗi dòng kiểm tra được):
- [ ] Test hàm thuần: mimeType → `DocKind` (3 loại, mimeType lạ bị bỏ); chuỗi `q` đúng và thoát `'` / `\`; ánh xạ `parents` → `spaceId` / `projectId` / tên đúng (file trong thư mục dự án, thư mục không gian, ngoài Taskeo bị bỏ); `url` không phải Drive → `null`.
- [ ] Test hàm truy vấn với client Drive giả: không lọc → chỉ file trong thư mục của user, đúng thứ tự `modifiedTime`; lọc `spaceId` gồm cả thư mục dự án con; lọc `projectId`; không gian / dự án của user khác → 404; chưa có `driveFolderId` → rỗng và không gọi Drive; chưa có scope → không gọi Google, trả kết quả "chưa kết nối"; Google lỗi → lỗi đã phân loại, log không chứa token / URL.
- [ ] Test route `GET /api/files`: 401, 503 (demo), 400 (`limit` sai, `kind` sai, `spaceId` + `projectId` cùng lúc, key lặp), 404, mã "chưa kết nối", 502, 200 đúng hình dạng.
- [ ] Chế độ demo: Tổng quan và `/docs` hiện dữ liệu mẫu như cũ, không gọi `/api/files`, không nạp `googleapis`.
- [ ] Chế độ `configured`, chưa kết nối Drive: Tổng quan và `/docs` hiện lời mời kết nối, không lỗi.
- [ ] Kiểm thật trên dev cùng người dùng: tài khoản đã kết nối Drive, có ít nhất một Doc do app tạo trong thư mục không gian → hiện ở "Tài liệu gần đây" và `/docs` với đúng tên, phụ đề, thời gian; `/docs?type=sheet` lọc đúng; bấm mở đúng file trên Google; `GET /api/files?spaceId=…` trả đúng file.
- [ ] Có trạng thái đang tải, rỗng, lỗi ở hai màn hình (kiểm bằng test component hoặc chạy tay có ảnh chụp).
- [ ] 4 lệnh typecheck / lint / test / build xanh.
- [ ] Docs 02, 04, 06 cập nhật.

**Tài liệu bị ảnh hưởng:** 02 Google · 04 kiến trúc · 06 API.

## 2. Kế hoạch từng phần

| Phần | Việc | File | Agent | Test cần viết |
|---|---|---|---|---|
| P1 | Kiểu `DriveFileItem { id, name, kind, url, modifiedAt, spaceId, projectId, spaceName, projectName }` + `ListFilesResponse { files }` trong `types.ts`. `domain/drive-files.ts`: `DOC_KIND_MIME`, `docKindFromMime`, chuyển `escapeDriveQueryValue` sang đây, `buildDriveFilesQuery({ kind?, parentIds? })`, `chunk` + `DRIVE_PARENTS_PER_QUERY = 40`, `buildFolderIndex`, `toDriveFileItem` (thư mục dự án thắng thư mục không gian; url qua `isDriveUrl`), `mergeRecent(lists, limit)`, `DRIVE_NOT_CONNECTED_CODE`. `validation.ts`: `listFilesQuerySchema` (limit 1–100 mặc định 20, kind, spaceId/projectId không cùng lúc) + `LIST_FILES_QUERY_KEYS` | `src/domain/types.ts`, `src/domain/drive-files.ts` (+test), `src/domain/validation.ts` (+test) | feature-builder | mime → kind; `q` thoát `'` `\`, có/không parents/kind; chunk; ánh xạ parents (dự án, không gian, ngoài Taskeo, thiếu id); url không phải Drive → null; merge khử trùng + thứ tự; schema |
| P2 | `drive-query.ts` re-export `escapeDriveQueryValue`. `server/google/drive-files.ts`: `listDriveFiles(userId, queries, pageSize, deps)` → `ok` / `not_connected` / `error`; kiểm scope trước; `files.list` song song mỗi q (`orderBy: modifiedTime desc`, `fields` tối thiểu); hạn tổng 10 s như `runBestEffort`; log 1 dòng `driveErrorLogFields`; dùng lại `defaultDeps` của `drive-provision.ts` | `src/server/google/drive-files.ts` (+test), `src/server/google/drive-query.ts` | google-integrator | không scope → không gọi Drive; đúng tham số; nhiều q song song; `GoogleNotConnectedError` → not_connected; lỗi Gaxios → error, log không token / URL; timeout |
| P3 | `server/drive-files.ts`: `listFiles(userId, { spaceId?, projectId?, kind?, limit })` → `{ ok, files }` hoặc `not_found` / `drive_not_connected` / `drive_error`. Một truy vấn Prisma không gian + dự án của user. projectId → 1 parent; spaceId → parents chia khối 40; không lọc → `pageSize=100`, lọc trong bộ nhớ theo index thư mục. Không có thư mục → `[]`, không gọi Google | `src/server/drive-files.ts` (+test) | api-builder | chỉ giữ file trong thư mục user, đúng thứ tự; spaceId gồm dự án con, chia khối >40; projectId; user khác → not_found; driveFolderId null → rỗng, không gọi; truyền not_connected / error |
| P4 | `http.ts`: `code?` trong `ApiError` + `failWithCode`. Route `GET /api/files` theo mẫu activities → 200 `{ files }` · 400 · 401 · 403 `drive_not_connected` · 404 · 502 · 503 | `src/server/http.ts` (+test), `src/app/api/files/route.ts` (+test) | api-builder | 401, 503, 400 (limit, kind, cả hai id, key lặp), 404, 403 có code, 502, 200 |
| P5 | `components/layout/query-provider.tsx` (QueryClient, staleTime 60 s, không refetch khi focus) bọc trong `AppShell`. `features/docs/drive-files-api.ts` (`ApiRequestError`, `driveFilesUrl`, `fetchDriveFiles`), `use-drive-files.ts` (`useDriveFiles(params, { enabled })`, không retry 4xx), `drive-files-state.ts` (`driveFilesViewState` → demo / connect / loading / error / empty / list) | 4 file trên + `app-shell.tsx`, các `*.test.ts` | feature-builder | `driveFilesUrl`; `fetchDriveFiles` với fetch giả (200, 403 code, 502, JSON hỏng); predicate retry; bảng trạng thái |
| P6 | `FileRow` nhận `Pick<WorkspaceFile, …>` + prop `demo` (câu "Tài liệu mẫu…" chỉ ở demo). `drive-files-states.tsx`: lời mời kết nối Drive, skeleton, lỗi + thử lại. `RecentDocsCard` (limit 4) và `DocsView` (limit 100, `?type=`): demo giữ store, configured dùng `useDriveFiles`, phụ đề từ `projectName` / `spaceName`, ô tìm kiếm vẫn lọc. Sửa chú thích cuối `docs-view.tsx` | `src/features/docs/{file-row,docs-view,drive-files-states}.tsx`, `src/features/dashboard/recent-docs-card.tsx` | feature-builder | không có jsdom → logic đã test ở P5; chạy tay + ảnh chụp các trạng thái; demo không gọi `/api/files` |
| P7 | Script dev `scripts/dev-create-doc.mjs` (độc lập, không import `src/`): đọc Account, giải mã token như `crypto.ts`, `files.create` một Doc/Sheet/Slide trống trong thư mục không gian. `node --env-file=.env.local scripts/dev-create-doc.mjs <email> <spaceId> [doc\|sheet\|slide]`. Đầu file ghi rõ chỉ dùng ở dev | `scripts/dev-create-doc.mjs` | google-integrator | không; chạy tay |
| P8 | Docs 02 (liệt kê với `drive.file`), 04 (file mới), 06 (`GET /api/files`, 403 `drive_not_connected`) | `docs/02-google-cloud.md`, `docs/04-architecture.md`, `docs/06-api.md` | tự làm | không |

Thứ tự: P1 trước → P2, P5, P7 song song → P3 (cần P2) → P4 (cần P3) → P6 (cần P5, thử với P4) → P8.

Quyết định thiết kế:
- Chưa kết nối Drive → **403 + `error.code = "drive_not_connected"`** (giữ `data` một kiểu; UI xem `driveConnected` trước nên 403 chỉ khi scope bị thu hồi giữa chừng). `ApiError.code?` tương thích ngược.
- `DriveFileItem` / `ListFilesResponse` ở `domain/types.ts`, dùng chung client + server.
- Gần đây: không đưa parents vào `q` (200×200 thư mục không vừa), lấy 100 file mới nhất rồi lọc trong bộ nhớ. Theo không gian: chia khối 40 parents mỗi `q`, gọi song song.
- `QueryClientProvider` chung chung ở `components/layout`; hook + fetch ở `features/docs` (đúng luật lớp).

Rủi ro / phụ thuộc:
- Chuyển `escapeDriveQueryValue` sang domain: `drive-query.ts` phải re-export để code / test cũ xanh.
- "Gần đây" có thể ít hơn `limit` nếu app thấy >100 file ngoài thư mục Taskeo (không phân trang) — ghi ở docs 02.
- Không có jsdom: trạng thái tải / rỗng / lỗi kiểm bằng test hàm thuần + ảnh chụp tay.
- `useViewer()` có thể suspend; demo phải `enabled: false`, không nạp gì phía server.
- Script P7 lặp logic giải mã của `crypto.ts` (chấp nhận, chỉ dùng dev); cần `.env.local` và người dùng đã kết nối Drive.
- Route mới: đọc `node_modules/next/dist/docs/` về route handler trước khi viết; `connection()` + import động như mẫu activities.

Duyệt kế hoạch: ☐ chờ · ☑ người dùng đã duyệt (2026-11-27) · ☐ bỏ qua (`--yes`)

## 3. Thực hiện + kiểm thử

| Phần | Commit | Test thêm | typecheck | lint | test | build |
|---|---|---|---|---|---|---|
| P1 | `61c1536` | 63 (`drive-files.test.ts`) + `listFilesQuerySchema` (`validation.test.ts`) | ✅ | ✅ | ✅ 1149/1149 | ✅ |
| P7 | `4c59a41` | — (script dev, `node --check`, lint; chưa chạy thật) | — | ✅ | — | — |
| P5 | `bc3db00` | 35 (`drive-files-api.test.ts` 23, `drive-files-state.test.ts` 12) | ✅ | ✅ | ✅ | ✅ (đợt chung) |
| P2 | `3c45ef6` | 19 (`google/drive-files.test.ts` 16, `deadline.test.ts` 3); 28 test `drive-provision` vẫn xanh | ✅ | ✅ | ✅ | ✅ (đợt chung) |
| P6 | `b34626a` | 3 (`driveFileSubtitle`); không có jsdom → kiểm tay | ✅ | ✅ | ✅ | ✅ (đợt chung) |
| P3 | `3bc0d89` | 18 (`server/drive-files.test.ts`) | ✅ | ✅ | ✅ | ✅ (đợt chung) |
| P4 | `a882a86` | 29 (`api/files/route.test.ts` 27, `http.test.ts` +2) | ✅ | ✅ | ✅ 1253/1253 | ✅ `/api/files` ƒ |
| P8 | `d7e4ccd` | — (docs 02, 04, 06 + sửa chú thích `drive-provision.ts`) | — | ✅ | — | — |

Kiểm tay trên dev (`configured`, đã đăng nhập, **chưa** kết nối Drive): `/docs` và thẻ "Tài liệu gần đây" hiện lời mời kết nối Drive, không lỗi console; `GET /api/files` → 403 `drive_not_connected`, `spaceId`+`projectId` → 400, `limit=0` → 400, `spaceId=nope` → 404. Lần gọi đầu trả 500 do dev server đang chạy từ trước giữ bản biên dịch cũ của `validation.ts`; biên dịch lại (touch file) thì đúng. Còn thiếu: kiểm với Drive đã kết nối + file tạo bằng `scripts/dev-create-doc.mjs` (cần người dùng kết nối Drive).

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

**Sheet nhiệm vụ:** dòng T33 sẽ chuyển `Xong` sau merge (bước 7, mục 8; kết quả nêu trong báo cáo)

**Việc để sau:**
-
