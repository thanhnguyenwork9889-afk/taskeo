# T019 · Tiêu đề trang theo loại tài liệu (đóng dòng T36)

| | |
|---|---|
| Nhánh | `feat/T019-docs-type-pages` |
| Tạo từ | `develop` @ `6e27ed2` |
| Trạng thái | done |
| Ngày tạo | 2026-11-28 |

Nguồn: sheet nhiệm vụ, dòng **T36** "Trang Soạn thảo / Bảng tính / Trình chiếu lọc theo loại file" (đã ở `Đang làm`).

## 1. Docs – yêu cầu

**Mục tiêu:** Dòng T36 của sheet ("Trang Soạn thảo / Bảng tính / Trình chiếu lọc theo loại file") **về cơ bản đã xong** từ T015 / T017 / T018: sidebar có ba mục ra `/docs?type=doc|sheet|slide`, lọc đúng loại trên dữ liệu Drive thật, có trạng thái rỗng riêng từng loại, nút tạo chọn sẵn loại. Ghi chú "docs-view có, dữ liệu mẫu" trong sheet là tàn dư trước T015. Nhiệm vụ này chỉ làm nốt hai thứ còn thiếu thật sự và đóng dòng T36 một cách thật thà.

Lịch sử phạm vi (2026-11-28):
1. Người dùng chốt phương án "Hoàn thiện 3 trang loại" (tiêu đề tab + thanh tab có số đếm + sửa câu mô tả).
2. Sau khi trình kế hoạch, Claude nêu lại rằng thanh tab + số đếm trùng việc sidebar đang làm và buộc đổi `GET /api/files` sang không lọc `kind`, khiến giới hạn 100 đổi từ "mỗi loại" thành "cả ba loại" — một bước lùi để lấy tiện lợi đã có sẵn. Đồng thời kiểm chứng được rằng chỉ `/docs` và thẻ "Tài liệu gần đây" đang đọc dữ liệu thật, còn Công việc / Không gian / Dự án / Lịch / các thẻ Tổng quan đều đọc store demo (không có nhánh `isDemo`), nên mài thêm trang tài liệu là sai thứ tự so với T59.
3. Người dùng đồng ý thu hẹp: **bỏ thanh tab và số đếm**, giữ tiêu đề tab trình duyệt và sửa câu mô tả sai.

**Phạm vi:**
- Tiêu đề tab trình duyệt theo loại: `/docs?type=doc` → "Soạn thảo · Taskeo", `sheet` → "Bảng tính · Taskeo", `slide` → "Trình chiếu · Taskeo", `/docs` và `?type=` sai → "Kho lưu trữ · Taskeo". Dùng `title.template` + `title.default` ở `src/app/layout.tsx` và `generateMetadata` đọc `searchParams` ở `src/app/(app)/docs/page.tsx` (Next 16: `searchParams` là Promise, kiểu `PageProps<'/docs'>`).
- Một parser dùng chung cho server và client để `<title>` không lệch `<h1>`: nhận `string | string[] | null | undefined`, nhiều giá trị (`?type=doc&type=sheet`) → `null`. Client đổi sang `getAll("type")`.
- Sửa câu mô tả dưới tiêu đề cho khớp thực tế (danh sách phẳng, mới sửa trước), thay vì "sắp xếp theo từng không gian".
- Hàm thuần (parse + tiêu đề) đặt trong file `.ts` không JSX và có test.

**Ngoài phạm vi:**
- **Thanh tab chuyển loại trên trang và số đếm theo loại** — bỏ ở bước 2 ở trên; sidebar đã cho chuyển loại, và số đếm buộc phải đánh đổi giới hạn 100 file mỗi loại.
- Đổi tham số gọi `GET /api/files`: `DocsView` **giữ nguyên** `useDriveFileList({ kind, limit: 100 })`, nên không có bước lùi nào về số file mỗi loại.
- Tách thành ba route thật `/docs/soan-thao`…; lọc / nhóm theo không gian; phân trang khi > 100 file.
- Thêm `metadata` cho các trang khác (`/tasks`, `/calendar`, `/spaces`, `/projects/[id]`).
- Đụng `src/app/api/` hay `src/server/`.
- `sidebar.tsx:33` đọc `?type=` thô nên `?type=xyz` không làm sáng mục nào — ghi vào "việc để sau".

**Tiêu chí nghiệm thu** (mỗi dòng kiểm tra được):
- [x] `/docs?type=doc` có `<title>` "Soạn thảo · Taskeo" (dev: "… · Taskeo · Dev"); `?type=sheet` → "Bảng tính · …"; `?type=slide` → "Trình chiếu · …"; `/docs` và `/docs?type=xyz` → "Kho lưu trữ · …".
- [x] Các trang khác (`/`, `/tasks`, `/calendar`, `/spaces`) giữ nguyên tiêu đề "Taskeo" (dev: "Taskeo · Dev") qua `title.default`.
- [x] `/docs?type=doc&type=sheet`: `<title>` và `<h1>` cùng là "Kho lưu trữ", không lệch nhau.
- [x] `/docs?type=xyz` hiện Kho lưu trữ, không lỗi ở console, không vòng lặp điều hướng.
- [x] Danh sách vẫn lọc đúng loại và vẫn gọi `GET /api/files` **có** `kind` (không có bước lùi về giới hạn 100 file mỗi loại).
- [x] Không còn câu "sắp xếp theo từng không gian" ở trang tài liệu.
- [x] Có test cho hàm thuần parse `?type=` và dựng tiêu đề, gồm `?type=` sai, `?type=` lặp, khoảng trắng và đầu vào ác ý.
- [x] 4 lệnh `typecheck` / `lint` / `test` / `build` xanh.

**Tài liệu bị ảnh hưởng:** 04 kiến trúc (mô tả `features/docs` và trang `/docs`). Không đụng 01, 02, 03, 06.

## 2. Kế hoạch từng phần

Đã xác nhận trong `node_modules/next/dist/docs/` (Next 16.4.6): `searchParams` là Promise, kiểu dùng `PageProps<'/docs'>`; `generateMetadata` chỉ ở `page.tsx` (Server Component) và không export cùng `metadata`; `title.template` chỉ áp cho segment **con** nên phải đặt ở `src/app/layout.tsx`, kèm `title.default` bắt buộc.

| Phần | Việc | File | Agent | Test cần viết |
|---|---|---|---|---|
| P1 | Module hàm thuần, không JSX: `parseDocKindParam(value: string \| string[] \| null \| undefined): DocKind \| null` (qua `docKindSchema`; `null` / `undefined` / `""` / `[]` / sai / **nhiều giá trị** → `null`) và `docsPageTitle(kind: DocKind \| null): string` (`DOC_KIND_LABEL[kind]`, hoặc `"Kho lưu trữ"`). Chỉ import từ `@/domain/*` (được Server Component dùng, nên không import file nào có `"use client"` / JSX) | `src/features/docs/docs-params.ts` (mới) | `feature-builder` | `docs-params.test.ts`: `parseDocKindParam` với `"doc"` / `"sheet"` / `"slide"` / `null` / `undefined` / `""` / `" "` / `"DOC"` / `"xyz"` / `[]` / `["doc"]` / `["doc","sheet"]`; `docsPageTitle` cả 4 nhánh; một bộ 5 URL mẫu ghép `parseDocKindParam` → `docsPageTitle` ra 4 tiêu đề đúng |
| P2 | Tiêu đề tab trình duyệt: `src/app/layout.tsx` đổi `title: appTitle(getAppEnv())` → `title: { default: BASE, template: "%s · " + BASE }` với `BASE = appTitle(getAppEnv())`, giữ nguyên `description`; `src/app/(app)/docs/page.tsx` thêm `export async function generateMetadata({ searchParams }: PageProps<'/docs'>): Promise<Metadata>` → `parseDocKindParam((await searchParams).type)` → `{ title: docsPageTitle(kind) }`, kèm comment ngắn vì sao template nằm ở root layout. **Không** thêm `metadata` vào `src/app/(app)/layout.tsx` (sẽ chen vào giữa template) | `src/app/layout.tsx`, `src/app/(app)/docs/page.tsx` | `feature-builder` | Không (phần thuần đã test ở P1) |
| P3 | `DocsView`: dùng `parseDocKindParam(useSearchParams().getAll("type"))` thay `docKindSchema.safeParse(get("type"))` (dòng 27–28) và `docsPageTitle(kind)` cho tiêu đề (dòng 29); sửa câu mô tả dòng 37 thành "Tài liệu Google của bạn, mới sửa gần nhất xếp trước."  **Giữ nguyên** `useDriveFileList({ kind: kind ?? undefined, limit: DOCS_LIMIT }, query)` ở dòng 100 và mọi câu chú thích khác | `src/features/docs/docs-view.tsx` | `feature-builder` | Không viết mới (JSX); `npm run test` phải xanh |
| P4 | Chốt hành vi với `cacheComponents: true` (`next.config.ts:4`): chạy `npm run build`. Nếu Next báo `blocking-prerender-metadata-runtime` thì thêm `DynamicMarker` (`const Connection = async () => { await connection(); return null }` đặt trong `<Suspense>`, **không** `await` ở thân Page) theo tiền lệ `src/app/(auth)/login/login-auth-panel.tsx:92–102` + `login/page.tsx:38–40`. Không dùng `'use cache'`. Build xanh ngay → ghi kết luận vào mục 3, không thêm code | `src/app/(app)/docs/page.tsx` (có thể không đổi) | tự chạy, `feature-builder` nếu phải sửa | Không |
| P5 | Tài liệu: `docs/04-architecture.md` ghi `docs-params.ts` ở nhánh `features/docs/` và `generateMetadata` ở `/docs` + `title.template` ở root layout. Điền mục 3 và đánh dấu tiêu chí mục 1 | `docs/04-architecture.md`, `docs/tasks/T019-docs-type-pages.md`, `docs/tasks/README.md` | tự làm | Không |

Thứ tự: P1 → (P2 ‖ P3) → P4 → P5. P2 và P3 khác file hoàn toàn nên chạy song song được; typecheck chỉ xanh khi cả hai xong.

Rủi ro / phụ thuộc:
- **R1 (cao)** `next.config.ts:4` bật `cacheComponents: true`; đọc `searchParams` trong `generateMetadata` là dữ liệu lúc chạy, mà `/docs` hiện prerender được hết (static shell chỉ là `ShellSkeleton`, `app-shell.tsx:90`) → Next có thể **ném lỗi build** đòi chọn tường minh. Xử lý ở P4 bằng `DynamicMarker`; không mất gì về hiển thị vì static shell vốn chỉ là khung chờ.
- **R2** `/docs?type=doc&type=sheet`: server nhận mảng, client `get("type")` nhận `"doc"` → `<title>` lệch `<h1>`. Vì vậy một parser dùng chung nhận cả `string | string[]`, nhiều giá trị → `null`, và client đổi sang `getAll("type")`. Không `redirect()`.
- **R3** `useSearchParams` hiện không có `<Suspense>` phía trên (`docs-view.tsx:27`, `tasks-view.tsx:24`, `sidebar.tsx:33`) nhưng build xanh vì `AppShell` trả `ShellSkeleton` trước khi render `children`. P3 không thêm chỗ gọi mới, chỉ đổi cách đọc tại chỗ cũ.
- **R4** `title.template` ở root layout áp cho **mọi** trang con. Các trang khác không export `title` nên nhận `title.default` = `appTitle(env)`, không đổi gì — phải kiểm lại bằng tiêu chí nghiệm thu dòng 2.
- **R5** Không có hạ tầng test component (`vitest.config.ts:12`: chỉ `src/**/*.test.ts`, `environment: "node"`): logic cần test phải ở `.ts`. Không thêm `@testing-library/react`.
- **R6 (đã loại bỏ)** Rủi ro lớn nhất của phạm vi cũ — bỏ `kind` khỏi `GET /api/files` làm giới hạn 100 đổi nghĩa — không còn, vì P3 giữ nguyên tham số gọi API.

Ghi nhận, ngoài phạm vi: `docs-view.tsx:43` cho ra nút "Tạo soạn thảo" (câu hơi ngang); `sidebar.tsx:33` dùng `?type=` thô nên `?type=xyz` không làm sáng mục nào ở sidebar.

Duyệt kế hoạch: ☐ chờ · ☑ người dùng đã duyệt (2026-11-28, bản thu hẹp: bỏ thanh tab + số đếm) · ☐ bỏ qua (`--yes`)

## 3. Thực hiện + kiểm thử

| Phần | Commit | Test thêm | typecheck | lint | test | build |
|---|---|---|---|---|---|---|
| P1 | `727f89c` | 23 (`docs-params.test.ts`) | xanh | xanh | xanh 1949 | — |
| P2 | `5223d35` | — | xanh | xanh | xanh 1949 | xanh |
| P3 | `a2f120d` | — | xanh | xanh | xanh 1949 | — |
| P4 | gộp vào `5223d35` | — | xanh | xanh | xanh 1949 | xanh |

`verifier` chạy lại cả bốn lệnh trên working tree cuối: typecheck / lint / test (71 file, 1949 test) / build đều xanh. Bảng route: `/docs` = `◐ Partial Prerender`, `/_not-found` = `○ Static`.

**P4 — kết luận về `cacheComponents` (rủi ro R1 đã xảy ra đúng như dự đoán).**

`npm run build` báo đúng lỗi đã lường trước:

```
Route "/docs": Next.js encountered uncached or runtime data in `generateMetadata()`.
This route's metadata is blocked, but the rest of its content can be prerendered.
  - [dynamic] Render a marker component that calls `await connection()` inside <Suspense> on the page
blocking-prerender-metadata-runtime
```

Nhưng cách tài liệu Next hướng dẫn — đặt `DynamicMarker` **trong chính trang** `(app)/docs/page.tsx` — **vô tác dụng ở app này**. Lý do: `src/components/layout/app-shell.tsx:90` trả `<ShellSkeleton />` khi `workspace` còn `null` (dữ liệu ở localStorage nên trên server luôn `null`), tức AppShell **không render `children`**; không một thứ gì trong `src/app/(app)/**` được render ra HTML lúc prerender, kể cả marker. Kiểm chứng dứt điểm: đặt `await connection()` thẳng trong thân `DocsPage` (không `<Suspense>`) cũng không bị Next ghi nhận — nếu subtree của trang có tham gia prerender thì Next đã phải báo lỗi "accessed outside of `<Suspense>`".

Marker vì vậy phải nằm **trên** AppShell. Hai chỗ khả dĩ, đã đo cả hai bằng bảng route của `next build`:

| Chỗ đặt marker | `/_not-found` | `/login` | các route `(app)` |
|---|---|---|---|
| `src/app/layout.tsx` (root) | `◐` | `◐` | `◐` |
| **`src/app/(app)/layout.tsx`** (đã chọn) | **`○ Static`** | `◐` | `◐` |

Chọn `(app)/layout.tsx`: ranh giới hẹp nhất còn tác dụng, chỉ bao nhóm có trang đọc `searchParams`. `/login` vẫn `◐` vì lý do riêng của nó (panel đăng nhập / phiên), không liên quan marker. Không dùng `'use cache'` (không áp dụng được cho `searchParams`), không dùng `dynamic = "force-dynamic"` (đã bị bỏ khi bật `cacheComponents`).

Khi nào nội dung trang render được ở server (giai đoạn 2, dữ liệu lên Prisma — T59) thì chuyển marker về đúng `(app)/docs/page.tsx` như tài liệu; điều kiện này đã ghi trong comment của `(app)/layout.tsx`.

**Đã kiểm `<title>` thật** bằng `next start` (bản dev nên có hậu tố `· Dev`):

| URL | `<title>` |
|---|---|
| `/docs?type=doc` | `Soạn thảo · Taskeo · Dev` |
| `/docs?type=sheet` | `Bảng tính · Taskeo · Dev` |
| `/docs?type=slide` | `Trình chiếu · Taskeo · Dev` |
| `/docs` | `Kho lưu trữ · Taskeo · Dev` |
| `/docs?type=xyz` | `Kho lưu trữ · Taskeo · Dev` |
| `/docs?type=doc&type=sheet` | `Kho lưu trữ · Taskeo · Dev` |
| `/`, `/tasks`, `/calendar`, `/spaces` | `Taskeo · Dev` (qua `title.default`) |

## 4. Review code

Reviewer đã chạy (song song trên `git diff develop...HEAD`): `layer-reviewer`, `typescript-reviewer`, `security-reviewer` (chạy vì diff đọc input người dùng từ URL `?type=`).

**Không có phát hiện CRITICAL hay HIGH từ cả ba.** `security-reviewer` không có phát hiện ở bất kỳ mức nào.

| # | Mức | File:dòng | Vấn đề | Reviewer |
|---|---|---|---|---|
| R1 | MEDIUM | `docs/04-architecture.md:66, 69, 101` | Tài liệu chưa khớp code mới: thiếu `docs-params.ts` ở nhánh `features/docs/`, thiếu `DynamicMarker` ở nhánh `(app)/`, và bảng "Đặt file mới ở đâu" vẫn ghi trang "chỉ import một view từ `features/`" | layer |
| R2 | LOW | `src/app/(app)/docs/page.tsx:2` | Trang đầu tiên trong repo import một module không phải view từ `features/` (`docs-params`). Không vi phạm ranh giới lớp (`app → features` hợp lệ, ESLint không cấm), nhưng nới quy ước ghi ở `04-architecture.md:101` | layer |
| R3 | LOW | `src/components/layout/navigation.ts:17` | Chuỗi `"Kho lưu trữ"` còn viết cứng ở nhãn sidebar, trùng nghĩa với `DOCS_LIBRARY_TITLE`. Không dùng chung được vì `components/layout` bị ESLint cấm import `features/` | layer |
| R4 | LOW | `src/app/(app)/layout.tsx:5–9` | `Connection` là arrow async không có kiểu trả về tường minh, lệch khuôn `export async function` của repo (vd. `login-auth-panel.tsx`) | layer + typescript |
| R5 | LOW | `src/features/docs/docs-params.ts:20` | `value[0]` an toàn nhờ `typeof raw !== "string"` chứ không nhờ `noUncheckedIndexedAccess` (cờ này không bật trong `tsconfig.json`) | typescript |
| R6 | LOW | `src/app/(app)/docs/page.tsx:15` | `PageProps<"/docs">` là kiểu global do Next sinh ở `.next/types`; CI chạy trên cây sạch cần `next build` / `next typegen` trước `tsc` | typescript |
| R7 | LOW | `src/features/docs/docs-params.test.ts` | Thiếu vài ca: mảng một phần tử có khoảng trắng `["  doc  "]`, mảng một phần tử không hợp lệ `["xyz"]`; gợi ý thêm ca đầu vào ác ý `"</title><script>"`, `"doc\u0000"`, `"​doc"` | typescript + security |

**Đã tự kiểm chứng lại bằng cách đọc code (không nhận nguyên báo cáo của agent):**
- `grep` xác nhận `docs-view.tsx` không còn import thừa: `DOC_KIND_LABEL` vẫn dùng ở dòng 44 và 132, `DocKind` vẫn dùng ở prop của `DocsBody` / `DemoDocsList` / `DriveDocsList` / `DriveDocsEmpty`.
- `grep "Kho lưu trữ" src/` chỉ còn `navigation.ts:17` (R3) và một comment ở `docs-view.tsx:20`; không có chỗ viết cứng nào khác.
- Đọc `docs/04-architecture.md:95–110` xác nhận dòng 101 đúng là chỗ cần nới (R1, R2).
- R6 không phải do T019 gây ra: `LayoutProps<"/">` đã được dùng ở `src/app/layout.tsx` và `(app)/layout.tsx` từ trước, nên cây sạch vốn đã cần typegen. Repo cũng chưa có CI (T52 / backlog B9 chưa làm).

## 5. Fix bug

| Phát hiện | Xử lý | Commit |
|---|---|---|
| R1 (MEDIUM) | đã sửa: `docs/04-architecture.md` dòng 66 thêm `docs-params.ts`, dòng 69 thêm `DynamicMarker` kèm lý do, dòng 101 nới quy ước "trang chỉ import một view" | `6d7602e` |
| R2 (LOW) | đã sửa cùng R1: ghi rõ ngoại lệ "trang được import hàm thuần của chính feature để dựng `generateMetadata`", thêm một hàng mới về quy ước tiêu đề tab | `6d7602e` |
| R3 (LOW) | **bỏ qua**: `"Kho lưu trữ"` ở `navigation.ts:17` không dùng chung được với `DOCS_LIBRARY_TITLE` vì ESLint cấm `components/layout` import `features/`. Gộp một nguồn duy nhất phải dời hằng xuống `domain/labels.ts` — ngoài phạm vi T019, ghi vào "việc để sau" | — |
| R4 (LOW) | đã sửa: `Connection` → `async function Connection(): Promise<null>`, khớp khuôn `login-auth-panel.tsx` | `6d7602e` |
| R5 (LOW) | **bỏ qua**: `value[0]` đã an toàn nhờ `typeof raw !== "string"` che cả `null` lẫn `undefined`, đúng cả khi sau này bật `noUncheckedIndexedAccess`. Reviewer cũng ghi "không bắt buộc sửa" | — |
| R6 (LOW) | **bỏ qua**: không do T019 gây ra — `LayoutProps<"/">` đã dùng ở `src/app/layout.tsx` và `(app)/layout.tsx` từ trước, nên cây sạch vốn đã cần Next sinh kiểu. Repo cũng chưa có CI (T52 / backlog B9 chưa làm). Ghi vào "việc để sau" | — |
| R7 (LOW) | đã sửa: thêm 10 test — `["  doc  "]`, `["xyz"]`, và nhóm đầu vào ác ý (`</title><script>`, null byte, zero-width space, chuỗi 10k) kiểm cả ở tầng parser lẫn tầng tiêu đề | `6d7602e` |

Kết quả 4 lệnh sau khi sửa (`verifier`): typecheck xanh · lint xanh · test xanh **1959** · build xanh. `/docs` = `◐ Partial Prerender`, `/_not-found` = `○ Static`.

## 6. Review lại

Vòng 1: chạy lại cả ba reviewer của bước 4 trên `git diff 4443193..HEAD`.

**Không còn CRITICAL / HIGH.** `typescript-reviewer` kết luận "Approve"; `security-reviewer` không có phát hiện mới ở mọi mức; `layer-reviewer` tìm ra hai điểm chữ nghĩa lạc hậu, đã sửa luôn trong vòng này:

| # | Mức | File:dòng | Vấn đề | Xử lý |
|---|---|---|---|---|
| R8 | MEDIUM | `docs/04-architecture.md:102` | Hàng mới do chính bước 5 thêm viết đuôi tiêu đề là `· Taskeo` như hằng số, trong khi code dựng từ `appTitle(getAppEnv())` nên ở dev là `· Taskeo · Dev`; đồng thời đi ngược hàng "Hiện tên app, không viết cứng Taskeo" ở ngay bảng đó | đã sửa: ghi "phần đuôi (tên app kèm nhãn môi trường…) dựng từ `appTitle(getAppEnv())`, không viết cứng" |
| R9 | LOW | `src/features/docs/docs-params.ts:5–8` | Comment đầu file vẫn mô tả client đọc `useSearchParams().get("type")` (`string \| null`), trong khi P3 đã đổi sang `.getAll("type")`; ví dụ "client chỉ thấy doc" không còn đúng | đã sửa: comment mô tả `.getAll` và nói rõ vì sao không dùng `.get` |

Ngoài ra, hai điểm **tự kiểm chứng bằng cách chạy code** chứ không nhận báo cáo của agent:
- `"​doc".trim()` giữ nguyên zero-width space → ca test kỳ vọng `null` là đúng.
- `" doc".trim()` **ra `"doc"`** (no-break space bị trim bỏ) → đã thêm một ca test ghi lại hành vi này. Vô hại vì đầu ra vẫn là nhãn cố định, nhưng nếu sau này đổi cách chuẩn hoá thì test báo ngay.

Gợi ý của reviewer **không** làm, có lý do: test gọi thẳng `generateMetadata` của `page.tsx` (phải import một Server Component vào vitest môi trường node, chi phí cao hơn giá trị; bất biến "giá trị thô không ra `<title>`" đã đúng theo kiểu dữ liệu vì `docsPageTitle` chỉ nhận `DocKind | null`), và vài ca ác ý dạng mảng (`["</title>"]`) đi đúng cùng một nhánh code với ca chuỗi đã có.

Sau R8 + R9: typecheck xanh · lint xanh · test xanh **1960** (thêm ca no-break space).

## 7. Final

**Tóm tắt:**

Dòng T36 của sheet ("Trang Soạn thảo / Bảng tính / Trình chiếu lọc theo loại file") thực ra đã xong từ T015 / T017 / T018 — ba mục sidebar ra `/docs?type=doc|sheet|slide`, lọc đúng loại trên dữ liệu Drive thật. T019 làm nốt hai thứ còn thiếu và đóng dòng đó:

1. **Tiêu đề tab trình duyệt theo loại.** `title.template` + `title.default` ở `src/app/layout.tsx`, `generateMetadata` ở `src/app/(app)/docs/page.tsx`. Ba trang giờ phân biệt được khi mở nhiều tab.
2. **Một parser `?type=` dùng chung** (`src/features/docs/docs-params.ts`) cho server (`searchParams`: `string | string[]`) và client (`useSearchParams().getAll`), nên `<title>` không bao giờ lệch `<h1>` — kể cả `?type=doc&type=sheet`.
3. **Sửa câu mô tả sai**: "sắp xếp theo từng không gian" → "mới sửa gần nhất xếp trước" (danh sách vốn phẳng, không nhóm).

Phạm vi ban đầu còn có thanh tab chuyển loại kèm số đếm. **Đã bỏ giữa chừng** sau khi soát lại giá trị: nó trùng việc sidebar đang làm, và số đếm buộc gọi `/api/files` không lọc `kind`, làm giới hạn 100 đổi từ "mỗi loại" thành "cả ba loại" — một bước lùi để đổi lấy tiện lợi đã có sẵn. Người dùng đồng ý thu hẹp.

Khi soát lại cũng kiểm chứng được một điều đáng chú ý ngoài phạm vi: **chỉ `/docs` và thẻ "Tài liệu gần đây" đang đọc dữ liệu thật**; Công việc / Không gian / Dự án / Lịch và các thẻ Tổng quan còn lại đều đọc store demo (`useWorkspace`, không có nhánh `isDemo`), nên đăng nhập Google thật vẫn thấy dữ liệu mẫu. Việc mở khoá nằm ở T59.

Phát sinh kỹ thuật đáng ghi nhớ: với `cacheComponents: true`, đọc `searchParams` trong `generateMetadata` làm `next build` lỗi `blocking-prerender-metadata-runtime`. Cách tài liệu Next hướng dẫn (đặt marker `connection()` trong chính trang) **không dùng được** ở app này vì `AppShell` trả `ShellSkeleton` và không render `children` lúc prerender. Marker đặt ở `src/app/(app)/layout.tsx` — ranh giới hẹp nhất còn tác dụng; đặt ở root layout cũng chạy nhưng kéo `/_not-found` khỏi `○ Static`.

**Tiêu chí nghiệm thu:** 8/8 đạt (đánh dấu ở mục 1). Đo bằng `next start` trên bản production (10/10 URL đúng tiêu đề) và mở thật bằng trình duyệt ở chế độ configured: `?type=xyz` và `?type=doc&type=sheet` đều ra "Kho lưu trữ" ở cả `<title>` lẫn `<h1>`, `?type=sheet` lọc đúng một Sheet, console không có lỗi.

**Tài liệu đã cập nhật:** `docs/04-architecture.md` (dòng 66 `docs-params.ts`, dòng 69 `DynamicMarker` kèm lý do, dòng 101 nới quy ước "trang chỉ import một view", thêm hàng quy ước tiêu đề tab). `docs/tasks/README.md`. Không đụng 01, 02, 03, 06 — T019 không thêm route, biến môi trường hay scope nào.

**Merge vào develop:** commit `6366974`, ngày 2026-11-28

**Sheet nhiệm vụ:** dòng T36 chuyển `Xong` sau merge (bước 7, mục 8; kết quả nêu trong báo cáo).

**Việc để sau:**
- R3: `"Kho lưu trữ"` viết cứng ở `src/components/layout/navigation.ts:17`, trùng nghĩa `DOCS_LIBRARY_TITLE` nhưng không dùng chung được (ESLint cấm `components/layout` import `features/`). Muốn một nguồn duy nhất thì dời hằng xuống `domain/labels.ts`.
- R6: `PageProps<"/docs">` và `LayoutProps<"/">` cần Next sinh kiểu, nên CI chạy trên cây sạch phải có `next build` / `next typegen` trước `tsc`. Nhớ khi làm T52 (CI).
- `src/components/layout/sidebar.tsx:33` đọc `?type=` thô chưa qua parser, nên `/docs?type=xyz` không làm sáng mục nào ở sidebar (trang thì đúng). Sửa bằng `parseDocKindParam` sẽ vướng luật `components/layout` không import `features/` — cùng gốc với R3.
- Nút trên trang tài liệu hiện chữ "Tạo soạn thảo" (`docs-view.tsx:44`), câu hơi ngang.
- Thanh tab chuyển loại + số đếm theo loại: đã bỏ có chủ đích. Nếu dùng trên điện thoại thấy bí (bottom nav không có mục tài liệu) thì cân nhắc lại — lúc đó nên làm không kèm số đếm để khỏi đụng giới hạn 100.
- Khi T59 đưa dữ liệu lên server và trang render được ở server, chuyển `DynamicMarker` từ `(app)/layout.tsx` về đúng `(app)/docs/page.tsx` như tài liệu Next hướng dẫn.
- Thêm `metadata` cho các trang còn lại (`/tasks`, `/calendar`, `/spaces`, `/projects/[id]`) — hạ tầng `title.template` đã sẵn, mỗi trang chỉ cần một dòng `title`.
