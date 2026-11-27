# T011 · Chặn gắn tài khoản Google thứ hai vào cùng một user

| | |
|---|---|
| Nhánh | `fix/T011-block-second-google-account` |
| Tạo từ | `develop` @ `fcde4cf` |
| Trạng thái | 4-review |
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
- [ ] Test hàm thuần đủ các trường hợp: không có phiên → cho qua; provider khác `google` → cho qua; tài khoản vừa chọn đã có trong DB → cho qua (Auth.js tự xử lý); user hiện tại chưa có Account google → cho qua; cùng `providerAccountId` → cho qua; khác `providerAccountId` → chặn.
- [ ] Test callback `signIn`: chặn → trả `"/?drive=wrong-account"` và không gọi gì ghi DB; cho qua → `true`; lỗi tra DB → lỗi lan ra (không trả `true`).
- [ ] `schema.prisma` có `@@unique([userId, provider])` trên `Account`; migration mới trong `prisma/migrations/` đã áp lên DB dev (`npm run db:status` sạch).
- [ ] UI: mở `/?drive=wrong-account` khi đã đăng nhập → hiện thông báo, tham số biến khỏi URL.
- [ ] Kiểm thật trên dev cùng người dùng: bấm Kết nối Google Drive, chọn tài khoản Google thứ hai → về trang chủ với thông báo; DB không có thêm dòng `Account`; chọn đúng tài khoản → vẫn kết nối được.
- [ ] Đăng nhập lần đầu (user mới) và đăng nhập lại vẫn chạy (test + kiểm thật).
- [ ] 4 lệnh typecheck / lint / test / build xanh; chế độ demo không đổi.
- [ ] Docs 02, 03 (và 04 nếu có file mới) cập nhật.

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

Reviewer đã chạy:

| # | Mức | File:dòng | Vấn đề | Reviewer |
|---|---|---|---|---|
| R1 | | | | |

## 5. Fix bug

| Phát hiện | Xử lý | Commit |
|---|---|---|
| R1 | | |

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
