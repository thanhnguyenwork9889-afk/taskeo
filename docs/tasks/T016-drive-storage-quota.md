# T016 · Hiển thị dung lượng Google Drive ở sidebar

| | |
|---|---|
| Nhánh | `feat/T016-drive-storage-quota` |
| Tạo từ | `develop` @ `447b100` |
| Trạng thái | 3-build |
| Ngày tạo | 2026-11-27 |

Nguồn: sheet nhiệm vụ, dòng **T35** "Hiển thị dung lượng Drive (about.get) ở sidebar".

## 1. Docs – yêu cầu

**Mục tiêu:** Người dùng đã kết nối Google Drive thấy ngay ở sidebar mình đã dùng bao nhiêu dung lượng Google (vd. "3,2 GB / 15 GB" kèm thanh tiến độ), lấy thật từ Drive API `about.get` (`fields=storageQuota`).

**Phạm vi:**
- Server (`src/server/google/drive-storage.ts`): `getDriveStorageQuota(userId)` gọi `drive.about.get({ fields: "storageQuota" })`, theo đúng khuôn của `listDriveFiles`: kiểm scope `drive.file` trước (chưa có → `not_connected`, không nạp `googleapis`), hạn tổng 10 s qua `runWithDeadline`, `GoogleNotConnectedError` / `GoogleScopeMissingError` → `not_connected` im lặng, lỗi khác / quá hạn → `error` + log một dòng an toàn (`driveErrorLogFields`). Không bao giờ ném. `about.get` dùng được với scope `drive.file` — **không thêm scope mới**.
- Domain (`src/domain/drive-storage.ts`, có test): chuyển `storageQuota` thô (Drive trả số int64 dạng chuỗi, `limit` có thể vắng = không giới hạn) thành `DriveStorage { usage, limit | null, usageInDrive, usageInDriveTrash }` (số byte, chuỗi sai / âm → bỏ hoặc coi là lỗi); tính phần trăm đã dùng (kẹp 0–100, `null` khi không giới hạn); định dạng byte tiếng Việt (`1,5 GB`, `850 MB`, `0 B`, cơ số 1024 như Google hiển thị); mức cảnh báo (≥ 90 % → `danger`, ≥ 75 % → `warning`).
- API `GET /api/drive/storage` (`src/app/api/drive/storage/route.ts`): `await connection()` → `getApiUserId()` → `import()` động hàm server → 200 `{ data: { storage: DriveStorage } }` · 401 · 403 `code: "drive_not_connected"` · 502 Google lỗi / quá hạn · 503 demo / thiếu cấu hình. Không nhận query.
- UI sidebar: dưới công tắc Google Drive, chỉ khi `driveStatus(viewer) === "connected"`, hiện khối dung lượng: chữ "Đã dùng X / Y" (không giới hạn → "Đã dùng X"), thanh tiến độ có `role="progressbar"` + `aria-valuenow/min/max` + nhãn, màu đổi theo mức cảnh báo. Có trạng thái đang tải (khung chờ), lỗi (một dòng "Không tải được dung lượng" + nút Thử lại). Gọi API qua TanStack Query (`staleTime` 5 phút, không retry khi server đã trả lời, như `shouldRetryDriveFiles`). Chế độ demo / chưa kết nối: không hiện, không gọi API.
- Tài liệu: 04 (file mới), 06 (route mới), 02 (ghi rằng `about.get` dùng scope `drive.file` sẵn có).

**Ngoài phạm vi:**
- Phân tích dung lượng theo không gian / dự án, liệt kê file lớn.
- Nút mua thêm dung lượng / liên kết trang Google One (có thể thêm sau).
- Hiện dung lượng ở mobile-nav / topbar (sidebar trên mobile là ngăn kéo, vẫn thấy khối này).
- Tự làm mới khi file thay đổi (chỉ theo `staleTime` + khi tải lại trang).

**Tiêu chí nghiệm thu** (mỗi dòng kiểm tra được):
- [ ] `src/domain/drive-storage.ts` có unit test cho: chuỗi int64 hợp lệ, `limit` vắng (không giới hạn), giá trị sai / âm, phần trăm kẹp 0–100 (kể cả usage > limit), định dạng byte (0 B, KB, MB, GB, TB, dấu phẩy thập phân), ngưỡng 75 % / 90 %.
- [ ] `getDriveStorageQuota` có test (deps giả): chưa có scope → `not_connected` không gọi `getDrive`; `GoogleNotConnectedError` → `not_connected` không log; lỗi Drive / quá hạn → `error`, log một dòng không có token / message; thành công → chỉ xin `fields: "storageQuota"`.
- [ ] `GET /api/drive/storage` trả đúng 200 / 401 / 403 (`drive_not_connected`) / 502 / 503 như trên; có test cho hàm map kết quả → phản hồi, hoặc cho route với hàm server giả.
- [ ] Sidebar ở chế độ configured + đã kết nối Drive hiện "Đã dùng X / Y" và thanh tiến độ với số khớp `about.get` thật trên tài khoản dev (kiểm tay, ghi kết quả ở mục 7).
- [ ] Chế độ demo và chưa kết nối Drive: không hiện khối dung lượng và không có request tới `/api/drive/storage` (kiểm qua tab Network / test của hàm chọn trạng thái).
- [ ] Đang tải → khung chờ; API lỗi → dòng lỗi + nút Thử lại gọi lại được.
- [ ] Không thêm scope Google mới; `src/server/google/scopes.ts` không đổi.
- [ ] typecheck, lint, test, build xanh.

**Tài liệu bị ảnh hưởng:** 02 Google · 04 kiến trúc · 06 API

## 2. Kế hoạch từng phần

| Phần | Việc | File | Agent | Test cần viết |
|---|---|---|---|---|
| P1 | Hàm thuần dung lượng: kiểu `DriveStorage`, `parseStorageQuota` (chuỗi int64 → số, `limit` vắng → `null`, sai / âm → `null` cả kết quả), `storagePercent` (kẹp 0–100, `null` khi không giới hạn), `formatBytes` (vi-VN, cơ số 1024, B/KB/MB/GB/TB, 1 chữ số thập phân khi < 10), `storageLevel` (`normal` / `warning` ≥ 75 % / `danger` ≥ 90 %) | `src/domain/drive-storage.ts`, `src/domain/types.ts` (thêm `DriveStorage`) | `feature-builder` | `src/domain/drive-storage.test.ts`: mọi nhánh ở tiêu chí 1 |
| P2 | Gọi Drive `about.get`: `getDriveStorageQuota(userId, deps)` → `ok` / `not_connected` / `error`, dùng lại `defaultDeps` + `runWithDeadline` + `classifyDriveError` như `drive-files.ts`; mở rộng kiểu client giả để có `about.get`; chỉ xin `fields: "storageQuota"`, truyền `signal` | `src/server/google/drive-storage.ts` (+ nếu cần, kiểu `DriveAboutClient` trong `drive-provision.ts`) | `google-integrator` | `src/server/google/drive-storage.test.ts`: không scope → không gọi `getDrive`; `GoogleNotConnectedError` → im lặng; lỗi 500 / quá hạn → `error` + đúng 1 log không token; `limit` vắng; phản hồi sai hình dạng → `error` |
| P3 | Route `GET /api/drive/storage` theo khuôn `/api/files` (`connection()` → `getApiUserId()` → `import()` động → `ok` / `failWithCode(403, …, DRIVE_NOT_CONNECTED_CODE)` / `fail(502)` / 401 / 503) | `src/app/api/drive/storage/route.ts` | `api-builder` | Test route với `getApiUserId` + module server giả (`vi.mock`): 200 / 401 / 403 có `code` / 502 / 503 |
| P4 | Khối dung lượng ở sidebar: `fetchDriveStorage` (kiểm hình dạng `{ data: { storage } }`, lỗi → error có `status` / `code`), hook TanStack `useDriveStorage` (`enabled` chỉ khi configured + đã kết nối, `staleTime` 5 phút, chỉ retry lỗi mạng 1 lần), hàm chọn trạng thái `driveStorageViewState` (`hidden` / `loading` / `error` / `ready`; 403 `drive_not_connected` → `hidden`), component `DriveStorageMeter` (chữ "Đã dùng X / Y", `role="progressbar"`, màu theo mức, khung chờ, lỗi + Thử lại); gắn vào `SessionStatus` dưới `DriveSwitch` khi `connected` | `src/components/layout/drive-storage-api.ts`, `drive-storage-state.ts`, `drive-storage-meter.tsx`, `sidebar.tsx` | `feature-builder` | `drive-storage-api.test.ts` (URL, hình dạng sai, lỗi có `code`, retry predicate), `drive-storage-state.test.ts` (demo / chưa kết nối / 403 → hidden, pending → loading, lỗi không dữ liệu → error, refetch lỗi giữ dữ liệu → ready) |
| P5 | Tài liệu: 04 (file mới), 06 (route mới, mã lỗi), 02 (`about.get` dùng `drive.file`, không thêm scope) | `docs/04-architecture.md`, `docs/06-api.md`, `docs/02-google-cloud.md` | tự làm (bước 7) | — |

Thứ tự: P1 → (P2 ∥ P4-phần-api/state) → P3 → P4 component + sidebar. P2 và P4 khác file, có thể giao song song sau P1.

Rủi ro / phụ thuộc:
- `components/layout/` không được import `features/`, nên P4 không dùng lại `ApiRequestError` / `readBody` của `features/docs/drive-files-api.ts`; chấp nhận lặp nhỏ (~30 dòng). Gom thành client API dùng chung để sau (sẽ cần khi làm T59).
- Tài khoản Google Workspace có thể không có `limit` (không giới hạn / pool tổ chức) → UI chỉ hiện "Đã dùng X", không thanh tiến độ.
- `usage` của Google gồm cả Gmail + Photos, không chỉ Drive; nhãn ghi "Dung lượng Google" để không hiểu nhầm, `usageInDrive` dùng cho tooltip.
- Mỗi lần mở trang (sau 5 phút) thêm một request `about.get`; quota Drive API dư sức, rate limit chung để T73.
- Kiểm thật cần tài khoản dev đã kết nối Drive (đã có từ T010 / T015).

Lập kế hoạch: repo không có agent `planner` trong `.claude/agents/`, Claude tự lập theo khuôn T015.

Duyệt kế hoạch: ☑ người dùng đã duyệt (2026-11-27)

## 3. Thực hiện + kiểm thử

| Phần | Commit | Test thêm | typecheck | lint | test | build |
|---|---|---|---|---|---|---|
| P1 | `4d29496` | `src/domain/drive-storage.test.ts` (87 test) | ✅ | ✅ | ✅ 1359 | ✅ |

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

**Sheet nhiệm vụ:** dòng T35 sẽ chuyển `Xong` sau merge (bước 7, mục 8; kết quả nêu trong báo cáo)

**Việc để sau:**
-
