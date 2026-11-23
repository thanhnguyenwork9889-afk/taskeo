---
name: task
description: Chạy một nhiệm vụ của app Workspace theo quy trình 7 bước (docs → kế hoạch từng phần → thực hiện + kiểm thử → review code → fix bug → review lại → final), mỗi nhiệm vụ một nhánh từ develop, xong thì merge vào develop. Dùng khi người dùng gõ /task, hoặc giao một tính năng / sửa lỗi / thay đổi có nhiều bước cần ghi nhận.
argument-hint: new [--yes] <mô tả> | continue [T00x] | status | release
---

# /task — quy trình nhiệm vụ

Quy tắc đầy đủ ở `docs/07-workflow.md`; đọc nó trước. File này là cách chạy.

## Luật cứng (không có ngoại lệ trừ khi người dùng nói rõ trong chat)

1. **Không đụng `main` / `master`**: không merge, rebase, cherry-pick, commit, reset, push vào hai nhánh này. Chỉ làm khi người dùng cho phép rõ ràng *cho lần đó*; một lần cho phép không áp dụng cho lần sau. Hook `protect-main.mjs` sẽ bắt hỏi lại — đừng tìm cách lách.
2. Nhánh nhiệm vụ luôn tạo từ `develop`. Không commit thẳng lên `develop`.
3. Merge vào `develop` chỉ sau khi bước 7 qua, bằng `git merge --no-ff`.
4. Không push khi người dùng chưa đồng ý (push là việc ra ngoài).
5. Mọi bước đều ghi vào file nhiệm vụ trong `docs/tasks/` rồi commit trên nhánh nhiệm vụ.

## Tham số

Đọc `$ARGUMENTS`:

- `new [--yes] <mô tả>` → **Khởi tạo**, rồi bước 1–2. Có `--yes` thì không chờ duyệt kế hoạch.
- `continue [T00x]` → tìm nhiệm vụ (theo mã, hoặc theo nhánh hiện tại), đọc dòng *Trạng thái* trong file nhiệm vụ, chạy tiếp từ bước đó.
- `status` → in bảng trong `docs/tasks/README.md` kèm nhánh hiện tại và `git status --short`. Không sửa gì.
- `release` → xem mục **Release**.
- Không có tham số → hỏi người dùng muốn `new` hay `continue`.

## Khởi tạo (`new`)

1. `git status --short` phải sạch; nếu không, dừng và hỏi người dùng (commit, stash, hay bỏ).
2. `git switch develop`. Nếu `develop` có upstream thì `git pull --ff-only`; nếu pull lỗi, dừng và báo.
3. Mã mới = mã lớn nhất trong `docs/tasks/README.md` + 1, định dạng `T` + 3 chữ số.
4. Chọn loại (`feat` `fix` `refactor` `docs` `test` `chore` `perf` `ci`) và slug tiếng Anh ngắn, chữ thường, gạch nối.
5. `git switch -c <loại>/T<số>-<slug>`.
6. Chép `docs/tasks/_template.md` thành `docs/tasks/T<số>-<slug>.md`, điền bảng đầu (nhánh, commit của develop, ngày hôm nay). Thêm một dòng vào `docs/tasks/README.md`.

## Bước 1 · Docs

Điền mục 1 của file nhiệm vụ từ yêu cầu của người dùng và code hiện có (đọc `docs/04-architecture.md` và các file liên quan). Tiêu chí nghiệm thu phải kiểm tra được. Nếu yêu cầu mơ hồ đến mức đổi hướng làm, hỏi người dùng **một** lần với các lựa chọn cụ thể.

## Bước 2 · Kế hoạch từng phần

Giao cho agent `planner` (đưa nó mục 1 và các đường dẫn file liên quan), rồi ghi kết quả vào mục 2: mỗi phần P1…Pn đủ nhỏ để một agent làm trong một lượt, có file, agent phụ trách và test cần viết.

Chọn agent theo vùng file:

| Vùng | Agent |
|---|---|
| `src/features`, `src/components`, `src/domain`, `src/app/(app)` | `feature-builder` |
| `prisma/`, `src/server/db.ts`, `src/server/<resource>`, `src/app/api` (trừ auth), `src/store` | `api-builder` |
| `src/server/google`, `src/server/auth`, `src/server/crypto.ts`, `src/proxy.ts`, `src/config` | `google-integrator` |
| chỉ `docs/` | tự làm |

Commit: `docs(T<số>): spec and plan`. Cập nhật *Trạng thái* = `3-build`.

**Cổng duyệt:** nếu không có `--yes`, trình bày kế hoạch ngắn gọn và dừng lượt, chờ người dùng duyệt hoặc sửa. Ghi ngày duyệt vào mục 2 khi người dùng đồng ý.

## Bước 3 · Thực hiện + kiểm thử

Với từng phần, theo thứ tự (phần độc lập, khác file nhau có thể giao song song):

1. Giao cho agent phụ trách: đưa mục 1, đúng dòng của phần đó trong mục 2, và nhắc viết test trước với logic trong `domain/`. Agent không được commit.
2. Xem diff agent tạo ra; giao `verifier` chạy 4 lệnh.
3. Đỏ → giao lại cho agent đó kèm lỗi nguyên văn (tối đa 2 lần, quá thì dừng hỏi người dùng).
4. Xanh → commit `<loại>(T<số>): P<n> <việc>`, điền một dòng ở mục 3.

Cập nhật *Trạng thái* = `4-review`, commit file nhiệm vụ.

## Bước 4 · Review code

Chạy song song trên `git diff develop...HEAD`:

- `layer-reviewer` (luôn luôn)
- `typescript-reviewer` (khi có file `.ts` / `.tsx` đổi)
- `security-reviewer` khi diff đụng auth, token, `src/server/google`, `src/server/crypto.ts`, `src/app/api`, Prisma, hay xử lý input người dùng

Gộp phát hiện vào bảng mục 4 (đánh số R1, R2…, bỏ trùng). Tự kiểm tra lại phát hiện nào nghi ngờ bằng cách đọc code; phát hiện sai thì ghi "bỏ qua: không tái hiện được" ở bước 5. Commit `docs(T<số>): code review findings`. *Trạng thái* = `5-fix`.

## Bước 5 · Fix bug

- Sửa mọi CRITICAL và HIGH; MEDIUM sửa nếu nhỏ và trong phạm vi; LOW ghi lại để sau.
- Giao sửa cho agent phụ trách vùng file đó, kèm mã phát hiện và mô tả. Rồi `verifier`.
- Ghi bảng mục 5. Commit `fix(T<số>): address review findings`. *Trạng thái* = `6-rereview`.
- Không có gì cần sửa → ghi "Không có phát hiện cần sửa" và sang bước 7.

## Bước 6 · Review lại

Chạy lại đúng các reviewer ở bước 4 trên diff của bước 5 (`git diff <commit trước bước 5>..HEAD`). Ghi vào mục 6.

- Còn CRITICAL / HIGH → quay lại bước 5. Tối đa **2 vòng**; quá thì dừng, báo người dùng những gì còn lại và hỏi hướng xử lý.
- Sạch → *Trạng thái* = `7-final`.

## Bước 7 · Final

1. `verifier` lần cuối; cả 4 lệnh phải xanh.
2. Đối chiếu từng tiêu chí nghiệm thu ở mục 1, đánh dấu cái đã đạt. Cái nào chưa đạt → chưa được merge; báo người dùng.
3. Cập nhật tài liệu đánh số bị ảnh hưởng (01, 02, 03, 04, 06) và `docs/tasks/README.md` (trạng thái `done`).
4. Điền mục 7, *Trạng thái* = `done`. Commit `docs(T<số>): final summary`.
5. Merge:
   ```
   git switch develop
   git merge --no-ff <nhánh> -m "merge: T<số> <tên nhiệm vụ>"
   ```
   Xung đột → `git merge --abort`, quay về nhánh nhiệm vụ, báo người dùng; không tự giải quyết xung đột ở file người khác đang sửa.
6. Ghi hash commit merge vào mục 7 và vào cột *Merge vào develop* của README (commit nhỏ trên `develop`: `docs(T<số>): record merge` — ngoại lệ duy nhất cho luật "không commit thẳng lên develop").
7. Giữ nhánh nhiệm vụ (không xoá). Hỏi người dùng có muốn push `develop` và nhánh nhiệm vụ lên GitHub không.

## Release (`develop` → `main`)

Chỉ chuẩn bị, **không merge**:

1. `git log --oneline main..develop` (dùng `origin/main` nếu `main` không có ở local) và liệt kê nhiệm vụ đã merge trong đó.
2. Chạy `verifier` trên `develop`.
3. Trình bày tóm tắt và hỏi người dùng có cho phép merge `develop` vào `main` không.
4. Chỉ khi người dùng trả lời đồng ý trong chat cho lần này: `git switch main`, `git merge --no-ff develop`, rồi hỏi tiếp trước khi push. Hook sẽ hỏi xác nhận thêm một lần — đó là bình thường.

## Báo cáo cuối mỗi lượt

Nêu: nhiệm vụ, nhánh, bước vừa xong, bước tiếp theo, và điều gì đang chờ người dùng (duyệt kế hoạch, cho phép push, quyết định khi review lặp quá 2 vòng).
