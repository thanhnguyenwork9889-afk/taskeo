# 07 · Quy trình nhiệm vụ

Mỗi việc (tính năng, sửa lỗi, tài liệu…) là một **nhiệm vụ** có mã `T001`, `T002`…, một nhánh riêng và một file ghi nhận ở `docs/tasks/`. Chạy cả quy trình bằng lệnh `/task` trong Claude Code (skill ở `.claude/skills/task/`).

## Nhánh

```
main / master   bản ổn định. CHỈ merge từ develop khi người dùng cho phép rõ ràng.
   ↑ (cần cho phép)
develop         nhánh tích hợp. Nhiệm vụ xong thì merge vào đây.
   ↑ git merge --no-ff
<loại>/T001-ten-ngan   mỗi nhiệm vụ một nhánh, tạo từ develop.
```

- Tên nhánh: `<loại>/T<số>-<slug>`, loại theo conventional commits: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`. Ví dụ `feat/T003-task-api`.
- Luôn tạo nhánh từ `develop` mới nhất. Không commit thẳng lên `develop`, `main`, `master`.
- Nhiệm vụ xong (qua bước 7) thì `git merge --no-ff` vào `develop`, rồi xoá nhánh nhiệm vụ (`git branch -d`, và trên GitHub nếu đã push). Lịch sử vẫn còn trong `develop`; file ở `docs/tasks/` thì giữ lại.
- **Không** merge, rebase, push hay commit vào `main` / `master` khi chưa được người dùng cho phép. Hook `.claude/hooks/protect-main.mjs` chặn các lệnh này và bắt hỏi lại người dùng (sửa hook thì chạy `node .claude/hooks/protect-main.test.mjs`). Hook là lưới an toàn cho Claude trên máy này; bảo vệ thật nằm ở branch protection trên GitHub.
- Push lên GitHub là việc ra ngoài: hỏi người dùng trước. `develop` không track `origin/main`; lần push đầu dùng `git push -u origin develop`.

## Bảy bước của một nhiệm vụ

| # | Bước | Ai làm | Ghi vào file nhiệm vụ | Điều kiện qua bước |
|---|---|---|---|---|
| 1 | **Docs** – yêu cầu | Claude (+ người dùng) | Mục tiêu, phạm vi, ngoài phạm vi, tiêu chí nghiệm thu, tài liệu bị ảnh hưởng | Tiêu chí nghiệm thu kiểm tra được |
| 2 | **Kế hoạch từng phần** | `planner` | Danh sách phần P1…Pn: file, agent, test cần viết | **Người dùng duyệt kế hoạch** (bỏ qua bằng `--yes`) |
| 3 | **Thực hiện + kiểm thử** | `feature-builder` / `api-builder` / `google-integrator`, rồi `verifier` | Mỗi phần: commit, test đã thêm, kết quả 4 lệnh | 4 lệnh xanh sau mỗi phần |
| 4 | **Review code** | `layer-reviewer` + `typescript-reviewer` (+ `security-reviewer` nếu đụng auth, token, API, DB) | Bảng phát hiện: mức, file:dòng, vấn đề | — |
| 5 | **Fix bug** | agent viết code của phần đó, rồi `verifier` | Phát hiện nào đã sửa, commit nào, cái nào bỏ qua và lý do | Hết CRITICAL / HIGH, 4 lệnh xanh |
| 6 | **Review lại** | các reviewer ở bước 4, chỉ trên diff sửa | Kết quả vòng review lại | Không còn CRITICAL / HIGH. Tối đa 2 vòng 5↔6, quá thì dừng hỏi người dùng |
| 7 | **Final** | Claude | Tóm tắt, tiêu chí nghiệm thu đã đạt, tài liệu đã cập nhật, commit merge | Merge `--no-ff` vào `develop`. Sau đó cập nhật sheet nhiệm vụ (xem dưới) |

Mỗi bước kết thúc bằng một commit trên nhánh nhiệm vụ, ví dụ `docs(T003): spec and plan`, `feat(T003): P1 task API route`, `fix(T003): address review findings`.

## File ghi nhận

- `docs/tasks/README.md`: bảng tất cả nhiệm vụ và trạng thái.
- `docs/tasks/T001-<slug>.md`: một file cho mỗi nhiệm vụ, chép từ [`docs/tasks/_template.md`](tasks/_template.md), điền dần qua bảy bước.

Khi nhiệm vụ đổi kiến trúc, API, biến môi trường hay scope Google, cập nhật luôn tài liệu đánh số tương ứng (04, 06, 01, 02) trong bước 7.

## Sheet nhiệm vụ

Danh sách nhiệm vụ gốc của dự án (mã `T01`…`T75`, khác mã `T001`… của file nhiệm vụ) nằm ở sheet **Danh sách nhiệm vụ – Workspace cá nhân**, một Sheets artifact trên claude.ai: https://claude.ai/artifact/CgmHoabvhVbWtY8JAQsjK1 (tab *Nhiệm vụ*; tab *Review code*, *Test case*, *Release* là hướng dẫn).

- **Khởi tạo:** file nhiệm vụ ghi dòng *Nguồn* (`sheet nhiệm vụ, dòng T<xx>` hoặc `không có dòng trong sheet`); dòng đó chuyển sang `Đang làm` (đã `Đang làm` thì giữ).
- **Bước 7, sau merge và sau khi người dùng trả lời câu hỏi push:** dòng đó chuyển sang `Xong`, cột *Ghi chú* tóm tắt: mã `T<số>`, commit merge, "và push" chỉ khi đã push, đã làm gì, đã kiểm gì, việc để sau. Mẫu ghi chú đầy đủ ở `.claude/skills/task/SKILL.md` (Bước 7, mục 8). Kết quả nêu trong báo cáo, không ghi thêm vào file nhiệm vụ.
- Claude sửa sheet qua docs connector; chỉ sửa cột D *Trạng thái* và I *Ghi chú* của đúng dòng nhiệm vụ. Không sửa được → đưa người dùng nội dung hai ô để tự dán.

## Lệnh

| Lệnh | Việc |
|---|---|
| `/task new <mô tả>` | Tạo nhiệm vụ mới: mã, nhánh, file ghi nhận, chạy bước 1–2 rồi chờ duyệt |
| `/task new --yes <mô tả>` | Như trên nhưng không chờ duyệt kế hoạch |
| `/task continue [T00x]` | Chạy tiếp từ bước đang dở của nhiệm vụ (mặc định: nhánh hiện tại) |
| `/task status` | Liệt kê nhiệm vụ, bước hiện tại, nhánh |
| `/task release` | Chuẩn bị merge `develop` → `main`: tóm tắt thay đổi và **hỏi người dùng**, không tự merge |
