# 02 · Google Cloud (Giai đoạn 0)

1. Tạo project trên Google Cloud Console.
2. **OAuth consent screen**: loại External, trạng thái Testing.
3. **APIs & Services → Credentials → OAuth Client ID** (loại Web application). Tạo **một client cho mỗi môi trường** (`Taskeo Dev`, `Taskeo`) để lộ secret của môi trường này không ảnh hưởng môi trường khác.
4. Redirect URI theo môi trường:

   | Môi trường | Authorized redirect URI |
   |---|---|
   | development | `http://localhost:3000/api/auth/callback/google` |
   | production | `https://taskeo-zeta.vercel.app/api/auth/callback/google` |

   URL preview ngẫu nhiên của Vercel cho từng commit không đăng nhập Google được; dùng domain cố định của nhánh.
5. Điền Client ID / Secret vào `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`: development trong `.env.local`, production trên Vercel (xem [01-environment.md](01-environment.md#hai-môi-trường), [08-deploy.md](08-deploy.md)).

## Đăng nhập giai đoạn 1

Cấu hình ở `src/server/auth/auth.ts`; tham số nằm trong `GOOGLE_AUTHORIZATION_PARAMS` (`src/server/auth/google-tokens.ts`).

| Tham số | Giá trị | Vì sao |
|---|---|---|
| `scope` | `openid email profile` | Chỉ xin quyền đăng nhập; Drive / Calendar xin sau (xem dưới) |
| `access_type` | `offline` | Google trả refresh token để server gọi API khi người dùng không có mặt |
| `prompt` | `consent` | Google chỉ trả refresh token ở lần đồng ý đầu; bắt hiện màn đồng ý mỗi lần để luôn có refresh token mới |
| `include_granted_scopes` | `true` | Giữ các scope đã cấp khi xin thêm scope sau này |

- Lần đăng nhập đầu: Auth.js gọi `linkAccount`, token được mã hoá trước khi ghi bảng `Account`.
- Đăng nhập lại: Auth.js không ghi lại `Account`; `events.signIn` cập nhật token mới (đã mã hoá), chỉ ghi field Google trả về.
- `src/server/google/client.ts` dùng refresh token để lấy access token mới (sống khoảng 1 giờ) và lưu lại (đã mã hoá).
- Consent screen đang ở **Testing**: refresh token hết hạn sau 7 ngày, phải đăng nhập lại (hết khi chuyển In production, sheet T71).

Kiểm tra token đã lưu mã hoá (chỉ chạy với `.env.local` trỏ DB dev; chỉ xem tiền tố, không in giá trị token):

```bash
node --env-file=.env.local -e 'const {PrismaClient}=require("@prisma/client");const p=new PrismaClient();p.account.findMany({where:{provider:"google"},select:{refresh_token:true,access_token:true,scope:true}}).then(a=>console.log(a.map(x=>({refresh:(x.refresh_token||"").startsWith("v1:"),access:(x.access_token||"").startsWith("v1:"),scope:x.scope})))).finally(()=>p.$disconnect())'
```

Cả `refresh` và `access` phải là `true`.

## Scope theo giai đoạn

Khai báo ở `src/server/google/scopes.ts`. Đăng nhập lần đầu chỉ xin scope cơ bản; scope Drive / Calendar xin thêm khi cần (incremental authorization).

| Scope | Giai đoạn |
|---|---|
| `drive.file` | 3 |
| `calendar.readonly` | 4 |
| `calendar.events` | 4 (tuỳ chọn) |

Trước giai đoạn 3–4, đối chiếu lại phân loại (non-sensitive / sensitive / restricted) trên Google Cloud Console.

### Xin thêm `drive.file` (T010)

Việc trên Google Cloud Console (làm một lần, cho từng client / môi trường):

1. **OAuth consent screen → Data Access → Add or remove scopes**, thêm `https://www.googleapis.com/auth/drive.file`, lưu.
2. Consent screen đang ở Testing: tài khoản dùng thử phải có trong **Test users**.

Luồng trong app:

- **Lúc đăng nhập (T012):** trang đăng nhập có ô tick "Kết nối Google Drive luôn" (mặc định bật). Tick → `signInWithGoogle` gửi cùng bộ tham số với `connectGoogleDrive` (đăng nhập + `drive.file`); bỏ tick → chỉ `openid email profile`.
- **Sau khi đăng nhập:** đáy sidebar có công tắc **Google Drive** (`src/components/layout/drive-switch.tsx`, `role="switch"`). Tắt → bật chạy `connectGoogleDrive` (dưới đây); bật → tắt mở hộp xác nhận rồi chạy `disconnectGoogleDrive` (xem "Ngắt kết nối"). Chế độ demo không hiện.
- Nút gửi form tới server action `connectGoogleDrive` (`src/server/auth/actions.ts`): gọi `signIn("google", { redirectTo }, params)` với `params = buildIncrementalAuthorizationParams([drive])` (`src/server/auth/google-tokens.ts`).
  - Tham số thứ ba của `signIn` **thay hẳn** `scope` của provider, nên `scope` gửi đi là `openid email profile …/drive.file`; `access_type=offline`, `prompt=consent`, `include_granted_scopes=true` giữ như đăng nhập.
  - `login_hint` = email trong phiên, để Google chọn sẵn đúng tài khoản (chọn tài khoản khác sẽ bị chặn, xem dưới).
  - `redirectTo` lấy từ form, chỉ nhận đường dẫn nội bộ (`toSafeRedirectPath`, `src/server/auth/redirect-path.ts`), ngược lại về `/`.
- Google quay lại → `events.signIn` (người dùng đã có account) ghi token mới đã mã hoá và `Account.scope` mới.
- Server kiểm quyền bằng `hasGoogleScope` / `requireGoogleScope` (`src/server/google/granted-scopes.ts`, ném `GoogleScopeMissingError`); `getViewer()` trả `driveConnected` (chỉ boolean, chuỗi scope không ra client).
- **Granular consent:** người dùng có thể bỏ tick ô Drive ở màn đồng ý → `Account.scope` không có `drive.file`, nút vẫn hiện, không lỗi.
- **Chọn nhầm tài khoản (T011):** một user chỉ có một tài khoản Google. Nếu đang đăng nhập mà người dùng chọn một tài khoản Google khác chưa liên kết, callback `signIn` (`guardSignIn`, `src/server/auth/`) từ chối trước khi Auth.js gắn tài khoản: không ghi gì vào DB, chuyển về `/?drive=wrong-account`, app hiện thông báo "Bạn đã chọn tài khoản Google khác…" rồi bỏ tham số khỏi URL. DB có thêm ràng buộc `@@unique([userId, provider])` trên `Account` ([03-database.md](03-database.md)).
  - Callback đọc phiên từ cookie (`__Secure-authjs.session-token` / `authjs.session-token`) và bảng `Session`, không dùng `auth()`: `auth()` trả "không có phiên" khi DB lỗi, sẽ thành "cho qua". Lỗi DB trong callback → trang lỗi mặc định của Auth.js (`AccessDenied`).
  - Google vẫn ghi nhận người dùng đã đồng ý cho tài khoản bị từ chối; app không lưu token nào của tài khoản đó. Người dùng có thể gỡ quyền ở trang tài khoản Google nếu muốn.

### Ngắt kết nối Drive (T012)

- Server action `disconnectGoogleDrive` (`src/server/auth/actions.ts`) gọi `POST https://oauth2.googleapis.com/revoke` (token trong body form, timeout 10 s; `src/server/google/revoke.ts`). Không dùng `OAuth2Client.revokeToken` của thư viện: hàm đó đặt token vào query string, lỗi mang URL dễ lọt token vào log.
- **Google không cho thu hồi riêng một scope.** Thu hồi refresh token (hoặc access token khi không có) huỷ **mọi** quyền Taskeo có trên tài khoản Google đó, ở mọi thiết bị — gồm Drive và Calendar khi có. Phiên Taskeo là phiên trong DB nên vẫn đăng nhập. Hộp xác nhận nói rõ điều này.
- Thu hồi thành công, hoặc Google trả `invalid_token` (đã không còn hiệu lực), hoặc Account không còn token nào → ghi `access_token`, `refresh_token`, `expires_at` = `null`, `scope` = scope đăng nhập (`GOOGLE_SIGN_IN_GRANTED_SCOPE`, dạng Google lưu: `openid …/userinfo.email …/userinfo.profile`). Từ đó `driveConnected` = false và `getGoogleAuth` ném `GoogleNotConnectedError` cho tới khi kết nối lại.
- Token không giải mã được (đổi `TOKEN_ENCRYPTION_KEY`, dữ liệu hỏng) → không gọi Google (không có token để gửi) nhưng vẫn xoá token khỏi DB và báo `disconnected-local` (thông báo: quyền ở Google vẫn còn, hướng dẫn gỡ ở trang Tài khoản Google → Bảo mật → Ứng dụng bên thứ ba).
- Lỗi khác (mạng, 5xx, timeout, đọc / ghi DB lỗi) hoặc không có Account google → không đổi DB, báo `disconnect-failed` (riêng trường hợp Google đã thu hồi mà ghi DB lỗi: bấm lại sẽ nhận `invalid_token` và ghi được).
- Xong thì quay về trang hiện tại kèm `?drive=disconnected`, `?drive=disconnected-local` hoặc `?drive=disconnect-failed` (`withQueryParam`, chỉ đường dẫn nội bộ); `DriveNotice` hiện thông báo rồi bỏ tham số.
- Bật lại: `connectGoogleDrive` với `prompt=consent` → Google hỏi đồng ý lại, cấp refresh token mới.

Mã `?drive=` mà `DriveNotice` (`src/components/layout/drive-notice.ts`) hiểu: `wrong-account` (T011), `disconnected`, `disconnected-local`, `disconnect-failed` (T012).

### Thư mục Drive cho không gian / dự án (T013)

Việc trên Google Cloud Console (một lần cho mỗi project Cloud): **APIs & Services → Library → Google Drive API → Enable**. Thiếu bước này mọi lời gọi Drive trả 403 `accessNotConfigured`: không gian / dự án vẫn được tạo nhưng không có thư mục.

Cây thư mục trong My Drive của người dùng:

```
Taskeo/                      appProperties.taskeoRole = "root"
└── <tên không gian>/        taskeoRole = "space",   taskeoSpaceId = <Space.id>
    └── <tên dự án>/         taskeoRole = "project", taskeoProjectId = <Project.id>
```

- `POST /api/spaces` → `createSpace` ghi DB, rồi `provisionSpaceFolder` (`src/server/google/drive-provision.ts`) tạo thư mục không gian trong thư mục gốc, lưu `Space.driveFolderId`. `POST /api/spaces/[id]/projects` → `createProject` ghi DB (transaction cũ), rồi tạo thư mục con trong thư mục không gian, lưu `Project.driveFolderId`. Không gian chưa có thư mục → `provisionSpaceFolder` tạo bù, ghi có điều kiện `driveFolderId IS NULL`, **đọc lại** id đã lưu rồi mới `provisionProjectFolder` dưới id đó: hai dự án tạo đồng thời luôn nằm trong cùng một thư mục không gian (thư mục không gian của request thua thành thư mục rỗng mồ côi).
- Thư mục gốc không lưu trong DB: tìm bằng `files.list` với `q` = folder + `appProperties has { key='taskeoRole' and value='root' }` + `trashed=false` + `'me' in owners` (không nhận thư mục gốc người khác chia sẻ, khi sau này có Picker), `orderBy: createdTime`, `pageSize: 1`; không có thì tạo `APP_NAME` ở My Drive. Với `drive.file`, app chỉ thấy thư mục chính nó tạo. Người dùng chuyển "Taskeo" đi chỗ khác vẫn dùng lại được; đưa vào thùng rác thì lần sau tạo thư mục gốc mới.
- Tên thư mục: `toDriveFolderName` (`src/domain/drive-folder-name.ts`) — NFC, bỏ ký tự điều khiển / vô hình, gộp khoảng trắng, tối đa 200 code point, rỗng → "Không gian không tên" / "Dự án không tên".
- **Best-effort:** chưa có `drive.file` → không gọi Google và không nạp `googleapis`. Chưa kết nối (không có refresh token) → im lặng. Google lỗi / quá hạn / ghi DB lỗi → vẫn 201, `driveFolderId = null`, log một dòng chỉ có `userId`, `spaceId` / `projectId`, tên lỗi đã phân loại (`drive-errors.ts`) và mã HTTP; không log message / URL / header của lỗi gaxios.
- Timeout: Drive 5 s mỗi request, `retry: false`; refresh token 10 s mỗi lần thử (`transporterOptions` trong `client.ts`); hạn tổng 10 s cho mỗi lần tạo (tạo dự án trong không gian chưa có thư mục: hai lần, tối đa 20 s). Hết hạn → `AbortController` huỷ request Drive phía client và không bắt đầu lời gọi Drive nào nữa; request đang bay có thể vẫn hoàn tất phía Google (thư mục mồ côi, không ghi DB). Bước refresh token không nhận signal nên có thể chạy nốt ở nền (giới hạn bởi timeout mỗi lần thử).
- Không đồng bộ khi sửa / xoá: đổi tên không gian / dự án không đổi tên thư mục; xoá không xoá thư mục trên Drive (không xoá dữ liệu của người dùng).
- Refresh xong sau khi người dùng đã ngắt kết nối không ghi lại token: listener `"tokens"` trong `client.ts` chỉ cập nhật dòng Account còn `refresh_token`.

### Liệt kê file Drive (T015)

- `GET /api/files` → `listFiles` (`src/server/drive-files.ts`) đọc không gian / dự án của user (một truy vấn Prisma, lọc `userId`), dựng chuỗi `q` bằng `buildDriveFilesQuery` (`src/domain/drive-files.ts`): 3 mimeType Google (Docs / Sheets / Slides) hoặc một loại, `trashed=false`, thêm `('<id>' in parents or …)` khi lọc theo không gian / dự án. Gọi `listDriveFiles` (`src/server/google/drive-files.ts`): `files.list` với `orderBy: modifiedTime desc`, `fields` chỉ `id, name, mimeType, modifiedTime, webViewLink, parents`.
- **Với `drive.file`, app chỉ thấy file chính nó tạo hoặc người dùng mở bằng app.** File người dùng tự tạo trong thư mục Taskeo trên Drive **không** hiện. Trước khi có T32 (tạo Doc/Sheet/Slide), kiểm thật bằng script dev `ALLOW_DEV_SCRIPT=1 node --env-file=.env.local scripts/dev-create-doc.mjs <email> <spaceId> [doc|sheet|slide] [tên]` (tạo file trống trong thư mục không gian; chỉ dùng ở dev, không ghi lại token; từ chối chạy khi `NODE_ENV` / `VERCEL_ENV` = production, và với DB không phải localhost nếu thiếu `ALLOW_DEV_SCRIPT=1`).
- Gắn file với không gian / dự án qua `parents` khớp `driveFolderId` (thư mục dự án thắng thư mục không gian). File ngoài thư mục Taskeo của user bị bỏ.
- Tài liệu gần đây (không lọc): một lần `files.list` 100 file mới nhất rồi lọc trong bộ nhớ (200 × 200 thư mục không vừa một chuỗi `q`). Nếu app thấy hơn 100 file ngoài thư mục Taskeo, danh sách có thể ngắn hơn `limit` (chưa phân trang). Theo không gian: thư mục không gian + thư mục dự án, 40 thư mục mỗi `q`, gọi song song.
- Chưa có `drive.file` / chưa kết nối → 403 `code: "drive_not_connected"`, không gọi Google, không nạp `googleapis`. Google lỗi / quá hạn (10 s tổng, `runWithDeadline` trong `deadline.ts`, dùng chung với tạo thư mục) → 502, log một dòng `userId` + tên lỗi đã phân loại + mã HTTP.
- Giao diện: thẻ "Tài liệu gần đây" và trang `/docs` dùng dữ liệu thật ở chế độ `configured` (TanStack Query, `staleTime` 60 s). Tab Tài liệu ở trang không gian / dự án vẫn đọc store demo cho tới T59 (ID store khác ID DB).

### Dung lượng Google ở sidebar (T016)

- `GET /api/drive/storage` → `getDriveStorageQuota` (`src/server/google/drive-storage.ts`): `drive.about.get({ fields: "storageQuota" })`. **Dùng scope `drive.file` sẵn có, không thêm scope.** Đã kiểm thật trên tài khoản dev (chỉ có `drive.file`): trả `limit`, `usage`, `usageInDrive`, `usageInDriveTrash`.
- `usage` là dung lượng Google của cả tài khoản (Drive + Gmail + Photos), nên giao diện ghi "Dung lượng Google". `limit` vắng (Workspace không giới hạn / pool tổ chức) → chỉ hiện "Đã dùng X", không có thanh.
- Cùng khuôn với liệt kê file: kiểm scope trước (chưa có → 403 `drive_not_connected`, không nạp `googleapis`), hạn tổng 10 s, lỗi / quá hạn / `storageQuota` sai → 502, log một dòng an toàn.
- Giao diện: khối dưới công tắc Google Drive (`src/components/layout/drive-storage-meter.tsx`), chỉ khi `configured` + đã kết nối; TanStack Query `staleTime` 5 phút. Mỗi lần tải lại trang (quá 5 phút hoặc QueryClient mới) là một lần `about.get`; rate limit / cache phía server để T73.

## Bảo mật token

- Token Google được mã hoá AES-256-GCM (`src/server/crypto.ts`) trước khi ghi DB, bằng cách bọc `linkAccount` của Prisma adapter.
- Client không cầm token. Ngoại lệ có chủ đích: Google Picker (giai đoạn 3) chạy trên trình duyệt nên cần một route trả access token ngắn hạn chỉ có scope `drive.file`.
