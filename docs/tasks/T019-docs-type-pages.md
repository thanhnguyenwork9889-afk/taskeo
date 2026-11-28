# T019 · Hoàn thiện ba trang tài liệu theo loại (Soạn thảo / Bảng tính / Trình chiếu)

| | |
|---|---|
| Nhánh | `feat/T019-docs-type-pages` |
| Tạo từ | `develop` @ `6e27ed2` |
| Trạng thái | 2-plan |
| Ngày tạo | 2026-11-28 |

Nguồn: sheet nhiệm vụ, dòng **T36** "Trang Soạn thảo / Bảng tính / Trình chiếu lọc theo loại file" (đã ở `Đang làm`).

## 1. Docs – yêu cầu

**Mục tiêu:** Ba mục Soạn thảo / Bảng tính / Trình chiếu ở sidebar đã lọc đúng loại và dùng dữ liệu Drive thật (T015 / T017 / T018), nhưng vẫn dùng chung một trang không có dấu hiệu riêng: tiêu đề tab trình duyệt giống nhau, không chuyển loại được từ trong trang, `?type=` sai thì âm thầm về Kho lưu trữ, và câu mô tả hứa "sắp xếp theo từng không gian" trong khi danh sách phẳng theo lần sửa. Nhiệm vụ này hoàn thiện ba trang đó, vẫn một route `/docs?type=`.

Phạm vi do người dùng chốt ngày 2026-11-28 (phương án "Hoàn thiện 3 trang loại"); không tách route riêng, không thêm lọc theo không gian.

**Phạm vi:**
- Tiêu đề tab trình duyệt theo loại: `/docs?type=doc` → "Soạn thảo · Taskeo", `sheet` → "Bảng tính · Taskeo", `slide` → "Trình chiếu · Taskeo", `/docs` và `?type=` sai → "Kho lưu trữ · Taskeo". Dùng `title.template` ở root layout + `generateMetadata` đọc `searchParams` ở `src/app/(app)/docs/page.tsx` (Next 16: `searchParams` là Promise — đọc `node_modules/next/dist/docs/` trước khi viết).
- Thanh tab ngay trên trang: Tất cả · Soạn thảo · Bảng tính · Trình chiếu, mỗi tab là `<Link>` tới `/docs` / `/docs?type=…`; tab đang chọn có `aria-current="page"`; theo khuôn nút chuyển view của `features/tasks/tasks-view.tsx`.
- Số đếm trên mỗi tab: số file khớp loại đó **sau** khi áp ô tìm kiếm, cho cả chế độ demo (store) và configured (Drive). Chưa tải xong / chưa kết nối Drive / lỗi → không hiện số, không hiện `0` sai.
- Hệ quả của số đếm ở chế độ configured: `DocsView` chuyển sang gọi `GET /api/files` **không** kèm `kind` (một truy vấn dùng chung cho cả bốn tab, `limit=100`) rồi lọc loại ở client. Đổi ý nghĩa giới hạn: trước là 100 file mỗi loại, sau là 100 file mới nhất của tất cả loại — câu chú thích cuối trang phải nói rõ giới hạn này. Đổi tab không gọi lại API.
- `?type=` không hợp lệ (vd. `?type=xyz`): hiện Kho lưu trữ như hiện nay, tab "Tất cả" sáng, không lỗi runtime, không vòng lặp điều hướng.
- Sửa câu mô tả dưới tiêu đề cho khớp thực tế (danh sách phẳng, mới sửa trước), và câu chú thích cuối trang nêu giới hạn 100.
- Hàm thuần chọn tab + đếm theo loại đặt ở `src/domain/` (hoặc `features/docs/*.ts` không JSX) và có test.

**Ngoài phạm vi:**
- Tách thành ba route thật `/docs/soan-thao`… (phương án 3, người dùng không chọn).
- Lọc / nhóm theo không gian, dự án trên trang tài liệu (phương án 2) — để lại cho T59 hoặc nhiệm vụ riêng.
- Phân trang khi > 100 file (vẫn là việc để sau của T015 / T33).
- Thêm `metadata` cho các trang khác (`/tasks`, `/calendar`, `/spaces`, `/projects/[id]`).
- Đổi `GET /api/files` ở server; không đụng `src/app/api/`.

**Tiêu chí nghiệm thu** (mỗi dòng kiểm tra được):
- [ ] `/docs?type=doc` có `<title>` "Soạn thảo · Taskeo" (dev: "… · Taskeo · Dev"); `?type=sheet` → "Bảng tính · …"; `?type=slide` → "Trình chiếu · …"; `/docs` và `/docs?type=xyz` → "Kho lưu trữ · …".
- [ ] Trang `/docs` hiện thanh 4 tab Tất cả / Soạn thảo / Bảng tính / Trình chiếu; bấm một tab đổi URL sang `?type=` tương ứng và đổi danh sách, tab đó có `aria-current="page"`.
- [ ] Ở chế độ demo, mỗi tab hiện số file đúng loại; gõ vào ô tìm kiếm thì các số giảm theo kết quả khớp.
- [ ] Ở chế độ configured đã kết nối Drive, số trên tab khớp số dòng hiện ra khi bấm vào tab đó; khi đang tải, chưa kết nối Drive hoặc lỗi thì không tab nào hiện số.
- [ ] Đổi tab ở chế độ configured không phát sinh request `GET /api/files` mới (một truy vấn dùng chung).
- [ ] `/docs?type=xyz` hiện Kho lưu trữ, tab Tất cả sáng, không lỗi ở console.
- [ ] Không còn câu "sắp xếp theo từng không gian" ở trang tài liệu; câu chú thích cuối trang nêu giới hạn 100 file mới nhất.
- [ ] Có test cho hàm thuần đếm theo loại và chọn tab đang hoạt động (gồm `?type=` sai và ô tìm kiếm).
- [ ] 4 lệnh `typecheck` / `lint` / `test` / `build` xanh.

**Tài liệu bị ảnh hưởng:** 04 kiến trúc (mô tả `features/docs` và trang `/docs`). Không đụng 01, 02, 03, 06.

## 2. Kế hoạch từng phần

Đã xác nhận trong `node_modules/next/dist/docs/` (Next 16.4.6): `searchParams` là Promise, kiểu dùng `PageProps<'/docs'>`; `generateMetadata` chỉ ở `page.tsx` (Server Component) và không export cùng `metadata`; `title.template` chỉ áp cho segment **con** nên phải đặt ở `src/app/layout.tsx`, kèm `title.default` bắt buộc.

| Phần | Việc | File | Agent | Test cần viết |
|---|---|---|---|---|
| P1 | Module hàm thuần: `parseDocKindParam(string \| string[] \| null \| undefined)` (qua `docKindSchema`; rỗng / sai / **nhiều giá trị** → `null`), `docsPageTitle(kind)`, `DOCS_TABS` (Tất cả → doc → sheet → slide, href khớp `NAV_ITEMS`), `countFilesByKind(files)` (trả object mới), `tabCount(counts, kind)` (`counts === null` → `null`; `kind === null` → tổng), `docsListState(state, shownCount)` (hạ `list` → `empty` khi tab đang chọn rỗng) | `src/features/docs/docs-tabs.ts` (mới) | `feature-builder` | `docs-tabs.test.ts`: `parseDocKindParam` (3 loại hợp lệ, `null`, `""`, `"DOC"`, `"xyz"`, `[]`, `["doc"]`, `["doc","sheet"]`, `undefined`); `docsPageTitle` 4 nhánh; `DOCS_TABS` đúng 4 mục, nhãn khớp `DOC_KIND_LABEL`, href **đối chiếu `NAV_ITEMS`**; `countFilesByKind` (rỗng, lẫn loại, không chia sẻ object giữa 2 lần gọi); `tabCount`; `docsListState` (list+0 → empty, trạng thái khác giữ nguyên); 5 URL mẫu → 4 tiêu đề |
| P2 | `DocsTabsBar({ activeKind, counts })`: `<nav aria-label="Lọc tài liệu theo loại">` + `DOCS_TABS.map` ra `<Link aria-current={active ? "page" : undefined}>`, số chỉ render khi `tabCount !== null`. **Chỉ nhận props**, không gọi `useSearchParams` / `useViewer` (để dùng được trong `Suspense fallback`). Khuôn class từ `features/tasks/tasks-view.tsx:59–72`, đổi `<button aria-pressed>` → `<Link aria-current>` | `src/features/docs/docs-tabs-bar.tsx` (mới) | `feature-builder` | Không (vitest chỉ nhận `*.test.ts`, env node; logic nằm ở P1) |
| P3 | Nối dây `DocsView`: dùng `parseDocKindParam(useSearchParams().getAll("type"))`; tiêu đề qua `docsPageTitle`; sửa câu mô tả dòng 37; chèn `<DocsTabsBar>` (có cả trong `Suspense fallback` với `counts={null}`); demo: lọc `query` trước → `counts`, rồi lọc `kind`; configured: `useDriveFileList({ limit: DOCS_LIMIT }, query)` **bỏ `kind`**, `shown = files.filter(kind)`, `view = docsListState(state, shown.length)`, `counts = state ∈ {list, empty} ? countFilesByKind(files) : null`; sửa chú thích `DOCS_LIMIT` và câu cuối trang | `src/features/docs/docs-view.tsx` | `feature-builder` | Không viết mới (JSX); `npm run test` phải xanh |
| P4 | Tiêu đề tab trình duyệt: `src/app/layout.tsx` → `title: { default: BASE, template: "%s · " + BASE }` với `BASE = appTitle(getAppEnv())`; `src/app/(app)/docs/page.tsx` thêm `export async function generateMetadata({ searchParams }: PageProps<'/docs'>)` → `parseDocKindParam((await searchParams).type)` → `{ title: docsPageTitle(kind) }` + comment vì sao template nằm ở root layout | `src/app/layout.tsx`, `src/app/(app)/docs/page.tsx` | `feature-builder` | Không (phần thuần đã test ở P1) |
| P5 | Chốt hành vi với `cacheComponents: true` (`next.config.ts:4`): chạy `npm run build`. Nếu Next báo `blocking-prerender-metadata-runtime` thì thêm `DynamicMarker` (`const Connection = async () => { await connection(); return null }` trong `<Suspense>`, **không** `await` ở thân Page) theo tiền lệ `src/app/(auth)/login/login-auth-panel.tsx:92–102`. Không dùng `'use cache'`. Build xanh ngay → ghi kết luận vào mục 3, không thêm code | `src/app/(app)/docs/page.tsx` (có thể không đổi) | tự chạy, `feature-builder` nếu phải sửa | Không |
| P6 | Tài liệu: `docs/04-architecture.md:66` thêm `docs-tabs.ts`, `docs-tabs-bar.tsx` và ghi "một truy vấn `/api/files` dùng chung cho 4 tab, lọc loại ở client"; nhánh `app/` ghi `generateMetadata` ở `/docs` + `title.template` ở root layout. Điền mục 3 và đánh dấu tiêu chí mục 1 | `docs/04-architecture.md`, `docs/tasks/T019-docs-type-pages.md`, `docs/tasks/README.md` | tự làm | Không |

Thứ tự: P1 → (P2 ‖ P4) → P3 → P5 → P6. Không có hai phần nào ghi cùng một file.

Hai điểm kế hoạch tự chốt:
- Đã tải xong mà Drive trống → **vẫn hiện `0`** trên cả bốn tab (đó là số đúng, bớt một nhánh điều kiện). Tiêu chí "không hiện số" chỉ áp cho đang tải / chưa kết nối / lỗi.
- `src/app/layout.tsx` không có trong bảng phân vùng agent của skill → giao `feature-builder` cùng P4 (sửa 4 dòng, cùng mạch metadata với `docs/page.tsx`).

Rủi ro / phụ thuộc:
- **R1 (cao)** `next.config.ts:4` bật `cacheComponents: true`; đọc `searchParams` trong `generateMetadata` là dữ liệu lúc chạy, mà `/docs` hiện prerender được hết (static shell chỉ là `ShellSkeleton`, `app-shell.tsx:90`) → Next có thể **ném lỗi build** đòi chọn tường minh. Xử lý ở P5 bằng `DynamicMarker`; không mất gì về hiển thị vì static shell vốn chỉ là khung chờ.
- **R2** `/docs?type=doc&type=sheet`: server nhận mảng, client `get("type")` nhận `"doc"` → `<title>` lệch `<h1>`. Vì vậy một parser dùng chung nhận cả `string | string[]`, nhiều giá trị → `null`, và client đổi sang `getAll("type")`. Không `redirect()`.
- **R3** `useSearchParams` hiện không có `<Suspense>` phía trên (`docs-view.tsx:27`, `tasks-view.tsx:24`, `sidebar.tsx:33`) nhưng build xanh vì `AppShell` trả `ShellSkeleton` trước khi render `children`. Kết luận: **không thêm `useSearchParams` ở chỗ mới**; `DocsTabsBar` chỉ nhận props.
- **R4** Bỏ `kind` khỏi params đổi queryKey: đã soát hết người dùng — chỉ `docs-view.tsx` và `dashboard/recent-docs-card.tsx:59` (`{ limit: 20 }`, không ảnh hưởng); trang không gian / dự án không dùng Drive files; invalidate theo tiền tố `DRIVE_FILES_QUERY_KEY` vẫn trúng key mới; `query-keys.test.ts` không cần sửa.
- **R5** `useDriveFileList` tính `state` theo `files.length` của **mọi loại** → lọc client xong có thể `state === "list"` mà tab rỗng → card trắng. Bắt buộc có `docsListState`. Không đổi chữ ký `useDriveFileList` (dùng chung với dashboard).
- **R6** `status === "error"` mà còn dữ liệu cũ vẫn trả `list` / `empty`; số trên tab lấy từ dữ liệu cũ — nhất quán với danh sách đang hiện. Điều kiện `counts` phải theo `state`, **không** theo `result.status === "success"`.
- **R8** `limit=100` không `kind` là **100 file mới nhất của mọi loại** (`src/server/drive-files.ts:95–98`, `orderBy modifiedTime desc`, `mergeRecent`): người có >100 tài liệu sẽ thấy ít file một loại hơn trước, và số trên tab là số đếm **trong cửa sổ 100 file mới nhất**, không phải tổng tuyệt đối. Thêm sai số: khi không lọc `kind`, chuỗi `q` lấy cả lối tắt tới mọi loại đích (`src/domain/drive-files.ts:95–96`), lối tắt lạ chiếm slot rồi bị loại → có thể < 100 item. Nên viết "tối đa 100 file mới nhất", không hứa đúng 100.
- **R9** href `/docs?type=…` nằm ở hai nơi (`navigation.ts:13–17` và `DOCS_TABS`); không gộp được vì `components/layout` không được import `features/`. Giảm lệch bằng test đối chiếu trong `docs-tabs.test.ts`.
- **R10** Không có hạ tầng test component (`vitest.config.ts:12`): mọi logic cần test phải ở `.ts`. Không thêm `@testing-library/react` trong nhiệm vụ này.
- **R11** `docs-tabs.ts` được Server Component import → chỉ `import type` từ `drive-files-state`, không import file nào có `"use client"` / JSX.

Chuỗi ký tự chốt trước để agent không phải đoán:
- Mô tả dưới tiêu đề: `Tài liệu Google của bạn, mới sửa gần nhất xếp trước.`
- `aria-label` thanh tab: `Lọc tài liệu theo loại`; nhãn tab đầu: `Tất cả`.
- Chú thích cuối trang (nhánh configured): `Tài liệu thật trong các thư mục Drive của Taskeo, tối đa 100 file mới nhất của cả ba loại (chưa phân trang) — số trên mỗi thẻ đếm trong phạm vi đó. Với quyền drive.file, Taskeo chỉ thấy file do Taskeo tạo hoặc bạn gắn qua Taskeo; file tạo trực tiếp trên Drive cần gắn bằng “Gắn file từ Drive” mới hiện ở đây.`

Ghi nhận, ngoài phạm vi: `docs-view.tsx:43` cho ra nút "Tạo soạn thảo" (câu hơi ngang); `sidebar.tsx:33` dùng `?type=` thô nên `?type=xyz` không làm sáng mục nào ở sidebar — P3 không đụng sidebar, để lại mục "Việc để sau".

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

**Sheet nhiệm vụ:** dòng T36 sẽ chuyển `Xong` sau merge (bước 7, mục 8; kết quả nêu trong báo cáo)

**Việc để sau:**
-
