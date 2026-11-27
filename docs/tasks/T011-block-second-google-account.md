# T011 · Chặn gắn tài khoản Google thứ hai vào cùng một user

| | |
|---|---|
| Nhánh | `fix/T011-block-second-google-account` |
| Tạo từ | `develop` @ `fcde4cf` |
| Trạng thái | done |
| Ngày tạo | 2026-11-26 |

Nguồn: việc để sau của T010 (sheet **T30**), đề xuất bởi `security-reviewer` (MEDIUM) và kế hoạch T010. Làm trước sheet **T31** (tạo thư mục Drive): T31 dùng token Drive nên token phải thuộc đúng tài khoản Google người dùng đăng nhập.

## 1. Docs – yêu cầu

**Mục tiêu:** Một user chỉ có đúng một tài khoản Google. Khi đang đăng nhập mà người dùng chọn một tài khoản Google khác ở màn chọn tài khoản (ví dụ lúc bấm Kết nối Google Drive), app từ chối, không ghi gì vào DB và báo cho người dùng chọn lại.

**Hiện trạng (kiểm tra 2026-11-26, đọc `node_modules/@auth/core`):**
- `handle-login.js`: có phiên + tài khoản Google chưa liên kết với ai → Auth.js gọi `linkAccount` gắn vào user hiện tại, không hỏi. Tài khoản đã gắn với user khác → `OAuthAccountNotLinked` (đã chặn sẵn). Cùng tài khoản → đăng nhập lại bình thường.
- `callback/index.js`: callback `signIn({ user, account, profile })` chạy **trước** `handleLoginOrRegister`; trả `false` → `AccessDenied`, trả chuỗi → chuyển hướng tới URL đó (qua callback `redirect`), không ghi DB. Callback không nhận phiên hiện tại; phải tự đọc (vd. gọi `auth()`).
- `src/server/auth/auth.ts` chưa có callback `signIn`. `connectGoogleDrive` (T010) chỉ giảm rủi ro bằng `login_hint`; `GOOGLE_ACCOUNT_ORDER` chỉ làm cách đọc xác định.
- `prisma/schema.prisma`: `Account` có `@@id([provider, providerAccountId])`, `@@index([userId])`, chưa có ràng buộc một user một tài khoản mỗi provider. DB dev: 2 user, mỗi user 1 Account google.

**Phạm vi:**
- Hàm thuần quyết định có chặn không (vd. `shouldBlockAccountLink`), đầu vào: provider, `providerAccountId` vừa đăng nhập, user của phiên hiện tại (hoặc không có phiên), tài khoản Google sẵn có của user đó, tài khoản vừa chọn đã có trong DB chưa. Chặn khi và chỉ khi: có phiên, provider `google`, tài khoản vừa chọn chưa có trong DB, user hiện tại đã có Account google với `providerAccountId` khác.
- Callback `signIn` trong `auth.ts`: thu thập dữ liệu trên (đọc phiên, tra `Account`), gọi hàm thuần; chặn → trả URL nội bộ `"/?drive=wrong-account"`; không chặn → `true`. Lỗi DB không được nuốt thành "cho qua".
- Ràng buộc DB `@@unique([userId, provider])` trên `Account` + migration mới (tạo trên branch Neon `dev`). Kiểm trước khi migrate rằng không có user nào đang có hai Account cùng provider.
- UI: khi URL có `drive=wrong-account`, hiện thông báo (dùng `notify` có sẵn) kiểu "Bạn đã chọn tài khoản Google khác với tài khoản đang đăng nhập. Hãy chọn đúng tài khoản." rồi bỏ tham số khỏi URL.
- Docs: `02-google-cloud.md` (thay cảnh báo "chọn nhầm tài khoản" bằng hành vi mới), `03-database.md` (ràng buộc mới), `04-architecture.md` nếu thêm file.

**Ngoài phạm vi:**
- Cho phép nhiều tài khoản Google trên một user, hay đổi tài khoản Google đã liên kết.
- Ngắt kết nối / thu hồi quyền Drive (để sau).
- Áp migration lên production (làm khi release `develop` → `main`, theo docs 03; ghi vào việc để sau).
- Thu hồi phía Google quyền mà tài khoản bị từ chối vừa cấp (Google vẫn ghi nhận đồng ý; app không lưu token nào của tài khoản đó).

**Tiêu chí nghiệm thu** (mỗi dòng kiểm tra được):
- [x] Test hàm thuần đủ các trường hợp: không có phiên → cho qua; provider khác `google` → cho qua; tài khoản vừa chọn đã có trong DB → cho qua (Auth.js tự xử lý); user hiện tại chưa có Account google → cho qua; cùng `providerAccountId` → cho qua; khác `providerAccountId` → chặn.
- [x] Test callback `signIn`: chặn → trả `"/?drive=wrong-account"` và không gọi gì ghi DB; cho qua → `true`; lỗi tra DB → lỗi lan ra (không trả `true`).
- [x] `schema.prisma` có `@@unique([userId, provider])` trên `Account`; migration mới trong `prisma/migrations/` đã áp lên DB dev (`npm run db:status` sạch).
- [x] UI: mở `/?drive=wrong-account` khi đã đăng nhập → hiện thông báo, tham số biến khỏi URL.
- [x] Kiểm thật trên dev cùng người dùng: bấm Kết nối Google Drive, chọn tài khoản Google thứ hai → về trang chủ với thông báo; DB không có thêm dòng `Account`; chọn đúng tài khoản → vẫn kết nối được.
- [x] Đăng nhập lần đầu (user mới) và đăng nhập lại vẫn chạy (test + kiểm thật).
- [x] 4 lệnh typecheck / lint / test / build xanh; chế độ demo không đổi.
- [x] Docs 02, 03 (và 04 nếu có file mới) cập nhật.

**Tài liệu bị ảnh hưởng:** 02 Google · 03 DB · 04 kiến trúc (nếu thêm file).

## 2. Kế hoạch từng phần

Kết quả kiểm tra của planner (đọc `node_modules`):
- **Không dùng `auth()` trong callback.** Gọi được (không đệ quy), nhưng `@auth/core` `session.js` bắt mọi lỗi adapter và trả `null` → DB lỗi bị hiểu là "không có phiên" → cho qua → `linkAccount` vẫn chạy. Thay bằng: đọc cookie phiên qua `cookies()` (`__Secure-authjs.session-token` khi https, `authjs.session-token` khi http; có cả hai thì ưu tiên `__Secure-`), rồi `prisma.session.findUnique({ where: { sessionToken }, select: { userId: true } })`, để lỗi lan ra.
- **Không lọc `expires`:** Auth.js (`handle-login.js`) gắn tài khoản dựa trên phiên mà không kiểm hạn, nên bộ chặn cũng coi token có trong DB là có phiên.
- Trả chuỗi `"/?drive=wrong-account"` → callback `redirect` mặc định đổi thành `${baseUrl}/?drive=wrong-account`; `handleLoginOrRegister`, `linkAccount`, `createSession`, `events.signIn` đều không chạy. Callback ném lỗi → `AccessDenied` (trang lỗi mặc định), không bao giờ thành "cho qua".
- Không dựa vào tham số `user` của callback (là `userByAccount ?? userFromProvider`). Một truy vấn đủ: `account.findMany({ where: { provider: "google", OR: [{ providerAccountId }, { userId }] }, select: { userId, providerAccountId } })`.
- Unique `(userId, provider)` tạo index có `userId` đứng đầu → `@@index([userId])` thừa, bỏ trong cùng migration.

| Phần | Việc | File | Agent | Test cần viết |
|---|---|---|---|---|
| P1 | Chạy SQL kiểm trùng trên DB dev (`SELECT "userId", provider, COUNT(*) FROM "Account" GROUP BY 1, 2 HAVING COUNT(*) > 1` → 0 dòng; có dòng thì dừng hỏi người dùng). Thêm `@@unique([userId, provider])`, bỏ `@@index([userId])` trên `Account`; migration `account_unique_user_provider` (`npm run db:migrate -- --name …`, không tương tác được thì `--create-only` rồi áp); `npm run db:status` sạch | `prisma/schema.prisma`, `prisma/migrations/<ts>_account_unique_user_provider/migration.sql` | `api-builder` | Không có unit test; kiểm bằng `db:status` + typecheck (client sinh lại có `userId_provider`) |
| P2 | Hàm thuần `shouldBlockAccountLink({ provider, providerAccountId, sessionUserId, userGoogleAccountIds, selectedAccountExists })` | `src/server/auth/account-link.ts` (mới) + `.test.ts` | `google-integrator` | không phiên · provider khác google · tài khoản đã có trong DB · user chưa có google · cùng id → cho qua; khác id → chặn |
| P3 | `readSessionUserId()` (hai tên cookie, `session.findUnique`, không lọc `expires`, không nuốt lỗi), `findGoogleAccountsForLink(providerAccountId, userId)` (một `findMany`), `guardSignIn({ account })` → `WRONG_ACCOUNT_REDIRECT` hoặc `true` | `src/server/auth/account-link.ts` (tách `account-link-data.ts` nếu dài) + test | `google-integrator` | chặn → trả URL, không gọi hàm ghi nào · cho qua → `true` · truy vấn ném lỗi → reject · không cookie → `true`, không truy vấn account · có cả hai cookie → ưu tiên `__Secure-` |
| P4 | Gắn `callbacks.signIn: guardSignIn` vào `auth.ts` (không đụng `events.signIn`, adapter); sửa chú thích `login_hint` trong `actions.ts` | `src/server/auth/auth.ts`, `src/server/auth/actions.ts` (chú thích) | `google-integrator` | Logic đã phủ ở P3; chạy lại `actions.test.ts` |
| P5 | Hàm thuần `driveNoticeFromParams(params)` (câu thông báo hoặc null), `searchWithout(params, "drive")`; component `DriveNotice` trong `AppShell` (bọc `Suspense`, `useEffect` → `notify` rồi `router.replace(..., { scroll: false })`) | `src/components/layout/drive-notice.ts` (mới) + `.test.ts`, `src/components/layout/app-shell.tsx` | `feature-builder` | `wrong-account` → câu đúng · giá trị khác / không có → null · bỏ `drive` giữ tham số khác · query rỗng → "" |
| P6 | Docs 02 (hành vi mới thay cảnh báo chọn nhầm tài khoản; Google vẫn ghi nhận đồng ý của tài khoản bị từ chối), 03 (ràng buộc, SQL kiểm trùng, production để sau), 04 (`account-link.ts`, `drive-notice.ts`) | `docs/02-google-cloud.md`, `docs/03-database.md`, `docs/04-architecture.md` | tự làm | — |
| P7 | Kiểm thật trên dev cùng người dùng: chọn tài khoản Google thứ hai → về `/` có thông báo, số dòng `Account` không đổi; chọn đúng tài khoản → vẫn kết nối; đăng xuất / đăng nhập lại | không commit | tự làm + người dùng | — |

Thứ tự: đợt 1 P1 ∥ P2 ∥ P5 → P3 → P4 (cùng `google-integrator`, cùng thư mục) → P6 → P7. Nên xong P1 trước P7 để kiểm thật có ràng buộc mới.

Rủi ro / phụ thuộc:
- **Người dùng thao tác ở P7** (cần hai tài khoản Google).
- Tên cookie khớp mặc định Auth.js; nếu sau này cấu hình `cookies` / `useSecureCookies` trong `auth.ts` thì phải sửa theo — ghi chú trong code.
- Lỗi DB trong callback → trang lỗi mặc định Auth.js (`AccessDenied`); chấp nhận, trang lỗi riêng ngoài phạm vi.
- Migration: có dòng trùng thì dừng, không tự xoá. **Production chưa áp** — khi release `develop` → `main` chạy lại SQL kiểm trùng trên Neon `main` rồi `db:deploy`; trước đó production vẫn được callback chặn.
- `GOOGLE_ACCOUNT_ORDER` thừa sau ràng buộc nhưng vô hại; giữ nguyên.

Duyệt kế hoạch: ☐ chờ · ☑ người dùng đã duyệt (2026-11-26) · ☐ bỏ qua (`--yes`)

## 3. Thực hiện + kiểm thử

| Phần | Commit | Test thêm | typecheck | lint | test | build |
|---|---|---|---|---|---|---|
| P1 | `2173d52` | — (kiểm trùng trên DB dev: 0 dòng; migration `20261126162202_account_unique_user_provider` chỉ `DROP INDEX "Account_userId_idx"` + `CREATE UNIQUE INDEX "Account_userId_provider_key"`; `db:status` khớp) | ✅ | ✅ | ✅ 818/818 | ✅ |
| P2 | `27787e4` | 8 test (`account-link.test.ts`) | ✅ | ✅ | ✅ 818/818 | ✅ |
| P5 | `654ed0b` | 9 test (`drive-notice.test.ts`); trình duyệt: `/tasks?view=list&drive=wrong-account` → thông báo hiện, URL còn `/tasks?view=list`, console sạch | ✅ | ✅ | ✅ 818/818 | ✅ |
| P3 | `e6602a3` | 17 test (`account-link-data.test.ts`) | ✅ | ✅ | ✅ 835/835 | ✅ |
| P4 | `6344fe6` | — (logic phủ ở P3; `actions.test.ts` vẫn xanh) | ✅ | ✅ | ✅ 835/835 | ✅ |
| P6 | (commit docs này) | — (docs 02: hành vi chọn nhầm tài khoản; 03: ràng buộc, SQL kiểm trùng, production để sau, cách tạo migration không tương tác; 04: `account-link*.ts`, `drive-notice.ts`) | — | — | — | — |
| P7 | không commit (kiểm thật) | — | ✅ | ✅ | ✅ 835/835 | ✅ |

Ghi chú P3/P4: agent làm xong code + test nhưng phiên bị ngắt trước khi báo lại; Claude đọc lại diff, chạy đủ 4 lệnh (835/835) rồi mới commit.

**Kiểm thật trên DB dev** (2026-11-27, người dùng thao tác ở `localhost:3000`; thêm tài khoản Google thứ ba vào Test users vì consent screen ở Testing — trước đó Google trả `403 access_denied` cho tài khoản chưa là test user):

| Trường hợp | Kết quả trong DB |
|---|---|
| Đăng nhập `…iplrmt`, bấm Kết nối Google Drive, chọn tài khoản Google thứ ba (chưa từng đăng nhập Taskeo) | Không thêm `Account` / `User` nào (vẫn 2 / 2), không có dòng trùng `(userId, provider)` |
| Bấm lại, chọn đúng tài khoản `…iplrmt` | `Account.scope` của `…iplrmt` có `drive.file`, token ghi lại lúc 00:43Z, vẫn `v1:` |
| Ràng buộc | `pg_indexes`: `Account_pkey`, `Account_userId_provider_key` |

- Người dùng báo sau khi bị chặn thì "bị đưa về login lại". Code Auth.js (callback trả URL → chỉ xoá cookie state/PKCE, không đụng cookie phiên) và DB (không có phiên mới sau lần chặn; phiên 00:37Z được dùng tiếp để kết nối lúc 00:43Z) không cho thấy phiên bị mất. Người dùng chấp nhận P7 đạt; nếu tái hiện được thì mở việc riêng.

Ghi chú P1: `migrate dev` từ chối chạy không tương tác (cảnh báo unique), nên SQL được sinh bằng `prisma migrate diff --from-url $DIRECT_URL --to-schema-datamodel prisma/schema.prisma --script` rồi áp bằng `npm run db:migrate`. `prisma generate` không thay được DLL engine vì dev server đang giữ file (client TS/JS đã sinh lại, typecheck thấy `userId_provider`); khởi động lại dev server trước P7.

## 4. Review code

Reviewer đã chạy: `layer-reviewer`, `typescript-reviewer`, `security-reviewer` trên `git diff develop...HEAD` @ `9bfd3e9`. Không có CRITICAL / HIGH. Đã xác nhận: fail-closed (lỗi DB lan ra → `AccessDenied`, không dùng `auth()`); callback chạy trước `handleLoginOrRegister`, trả chuỗi thì không `linkAccount` / `createSession` / `events.signIn`; không có đường vòng; không injection / XSS (thông báo tra từ bảng tĩnh bằng `Object.hasOwn`); migration chỉ `DROP INDEX` + `CREATE UNIQUE INDEX`; ranh giới lớp đúng.

| # | Mức | File:dòng | Vấn đề | Reviewer |
|---|---|---|---|---|
| R1 | MEDIUM | `src/server/auth/account-link-data.ts` `SESSION_COOKIE_NAMES` | Tên cookie phiên viết cứng theo mặc định Auth.js (và `proxy.ts` có bản sao riêng); nếu Auth.js chọn tên khác, guard thấy "không có phiên" → cho qua (chỉ còn ràng buộc DB chặn) | typescript |
| R2 | LOW | `account-link.ts:3`, `account-link-data.ts:6` | Hằng `GOOGLE_PROVIDER` khai báo hai lần | layer, typescript |
| R3 | LOW | `account-link-data.ts` `WRONG_ACCOUNT_REDIRECT` / `drive-notice.ts` | `"/?drive=wrong-account"` viết ở hai nơi, đồng bộ bằng comment (không import chéo lớp) | typescript, layer |
| R4 | LOW | `account-link-data.ts` `readSessionUserId` | Không lọc `expires` (khớp Auth.js; hướng sai là chặn thừa) | typescript |
| R5 | LOW | `account-link.ts:1` | `import "server-only"` cho hàm thuần | typescript |
| R6 | LOW | `src/components/layout/app-shell.tsx` `DriveNotice` | `router.replace(pathname + rest)`: pathname dạng `//host` có thể bị hiểu là URL ngoài | security |
| R7 | LOW | `account-link-data.ts` `readSessionUserId` | Khi https, guard còn lùi về cookie không tiền tố mà Auth.js không đọc (hậu quả: chặn thừa) | security |
| R8 | INFO | `migration.sql` | Migration không tự kiểm trùng; production có trùng thì tạo index thất bại (an toàn); đã ghi SQL kiểm trùng ở docs 03 | security |
| R9 | INFO | `guardSignIn` | TOCTOU khi hai callback song song; ràng buộc unique là chốt chặn cuối | security, layer |
| R10 | LOW | `drive-notice.ts` | Câu thông báo viết cứng, không ở `domain/labels.ts` | layer |

## 5. Fix bug

Commit trước bước 5: `d924556`.

| Phát hiện | Xử lý | Commit |
|---|---|---|
| R1 | đã sửa: `src/config/auth-cookies.ts` (`AUTH_SESSION_COOKIE_NAMES`, `__Secure-` trước) là nguồn duy nhất cho `proxy.ts` và `guardSignIn`; `auth-cookies.test.ts` khoá với `defaultCookies` của đúng bản `@auth/core` app đang dùng (resolve qua `next-auth`, vì exports map không mở đường dẫn nội bộ). Auth.js đổi tên mặc định → test đỏ. Nếu callback vẫn lọt, ràng buộc unique chặn ở DB | `25be628` |
| R2 | đã sửa: `GOOGLE_PROVIDER` export từ `account-link.ts`, `account-link-data.ts` dùng lại | `25be628` |
| R3 | để sau (LOW): cố ý không import chéo lớp; `account-link-data.test.ts` và `drive-notice.test.ts` cùng khoá giá trị | — |
| R4 | chấp nhận: khớp Auth.js (`getSessionAndUser` không kiểm hạn), hướng sai là chặn thừa | — |
| R5 | chấp nhận: file chỉ dùng phía server | — |
| R6 | đã sửa: hàm thuần `cleanedLocation(pathname, params)` trả `pathname` + query đã bỏ `drive`, hoặc `"/"` + query khi pathname không bắt đầu bằng `/` hay bắt đầu bằng `//`, `/\`; 4 test | `25be628` |
| R7 | chấp nhận: hậu quả chỉ là chặn thừa; kẻ tấn công phải có sẵn session token hợp lệ | — |
| R8 | chấp nhận: SQL kiểm trùng đã ghi ở docs 03 và việc để sau | — |
| R9 | chấp nhận: ràng buộc unique là chốt chặn cuối (docs 03) | — |
| R10 | để sau (LOW): gom nhãn UI khi có file nhãn chung | — |

Kết quả 4 lệnh sau khi sửa (tự chạy): typecheck ✅ · lint ✅ · test ✅ 842/842 · build ✅.

## 6. Review lại

Vòng 1 (`git diff d924556..25be628`, cùng ba reviewer): không có CRITICAL / HIGH / MEDIUM. Xác nhận R1 (nguồn chung tên cookie, `config/auth-cookies.ts` không import `@/` nên dùng được ở `proxy.ts` Edge; test khoá với `defaultCookies` của đúng bản `@auth/core`), R2, R6 (`cleanedLocation` luôn trả đúng một `/` đầu, không mutate, effect không lặp) đúng. Ghi chú LOW (để sau): `isSafeInternalPath` chưa loại ký tự điều khiển như `/	/host` (pathname từ Next đã mã hoá, rủi ro rất thấp); `auth-cookies.test.ts` dựa vào đường dẫn nội bộ `@auth/core/lib/utils/cookie.js` — vỡ khi nâng cấp thì test đỏ rõ ràng; test không bắt được trường hợp cấu hình `cookies` / `useSecureCookies` trong `auth.ts`. → `7-final`.

## 7. Final

**Tóm tắt:** Một user chỉ có một tài khoản Google. Callback `signIn` (`guardSignIn`, `src/server/auth/account-link-data.ts`) chạy trước khi Auth.js gắn tài khoản: có phiên (đọc cookie + bảng `Session`, không dùng `auth()` để lỗi DB không thành "cho qua"), tài khoản Google vừa chọn chưa có trong DB, user đã có tài khoản Google khác → trả `/?drive=wrong-account`, không ghi gì vào DB; app hiện thông báo rồi bỏ tham số khỏi URL (`DriveNotice`). Hàm quyết định thuần `shouldBlockAccountLink` có test đủ trường hợp. DB thêm `@@unique([userId, provider])` trên `Account` (thay `@@index([userId])`) làm chốt chặn cuối; tên cookie phiên gom về `src/config/auth-cookies.ts`, khoá với mặc định Auth.js bằng test. Thêm 51 test (791 → 842). Kiểm thật trên DB dev: chọn tài khoản thứ ba → không có `Account` / `User` mới; chọn đúng tài khoản → kết nối Drive được. 4 lệnh lần cuối: typecheck ✅ · lint ✅ · test ✅ 842/842 · build ✅ · `db:status` khớp.

**Tiêu chí nghiệm thu:** đạt cả 8 (mục 1). Ghi chú: "đăng nhập lại" có kiểm thật (người dùng đăng nhập lại cả hai tài khoản, `events.signIn` vẫn ghi token); "đăng nhập lần đầu của user mới" chỉ có test (không phiên → cho qua), chưa tạo user mới thật. Người dùng báo bị đưa về trang đăng nhập sau khi bị chặn; code Auth.js và DB không cho thấy phiên bị mất, người dùng chấp nhận P7 đạt.

**Tài liệu đã cập nhật:** `docs/02-google-cloud.md` (hành vi chọn nhầm tài khoản, vì sao không dùng `auth()`, Google vẫn ghi nhận đồng ý của tài khoản bị từ chối), `docs/03-database.md` (ràng buộc, SQL kiểm trùng, production chưa áp, cách tạo migration khi `migrate dev` không chạy được không tương tác), `docs/04-architecture.md` (`account-link*.ts`, `drive-notice.ts`, `config/auth-cookies.ts`), `docs/tasks/README.md`.

**Merge vào develop:** commit `<hash>`, 2026-11-27

**Việc để sau:**
- **Production:** khi release `develop` → `main`, chạy SQL kiểm trùng ở docs 03 trên Neon `main` rồi `npm run db:deploy`. Trước đó production vẫn được callback chặn.
- Nếu tái hiện được "bị đưa về đăng nhập sau khi bị chặn" thì mở việc riêng.
- LOW: R3 chuỗi `/?drive=wrong-account` ở hai lớp, R10 nhãn UI, ký tự điều khiển trong `isSafeInternalPath`, test cấu hình cookie tuỳ biến trong `auth.ts`.
- Tiếp theo: T012 (ô tick kết nối Drive ở trang đăng nhập + toggle Kết nối / Ngắt kết nối Drive ở sidebar), rồi sheet T31.
