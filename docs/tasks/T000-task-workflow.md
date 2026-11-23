# T000 · Thiết lập quy trình nhiệm vụ

| | |
|---|---|
| Nhánh | `chore/T000-task-workflow` |
| Tạo từ | `feat/app-shell-scaffold` @ `0d93f3a` (develop tạo từ `origin/main` @ `21a1dd7`) |
| Trạng thái | done |
| Ngày tạo | 2026-11-23 |

## 1. Docs – yêu cầu

**Mục tiêu:** Mọi việc chạy theo các bước docs → kế hoạch từng phần → kiểm thử → review code → fix bug → review lại → final; mỗi nhiệm vụ một nhánh; xong thì merge vào `develop`; không merge vào `main` / `master` khi chưa được phép.

**Phạm vi:**
- Tài liệu quy trình `docs/07-workflow.md`, mẫu và danh sách nhiệm vụ trong `docs/tasks/`.
- Skill `/task` điều phối các bước bằng các subagent của repo.
- Hook chặn ghi vào `main` / `master`.
- Tạo nhánh `develop`.

**Ngoài phạm vi:**
- Branch protection trên GitHub (cấu hình phía server, cần người dùng bật).
- CI.

**Tiêu chí nghiệm thu:**
- [x] Có nhánh `develop`, không track `origin/main`.
- [x] `/task new|continue|status|release` mô tả đủ 7 bước, cổng duyệt kế hoạch và luật merge.
- [x] Lệnh ghi vào main/master phải được người dùng xác nhận; lệnh đọc và lệnh trên nhánh nhiệm vụ không bị chặn (19 trường hợp thử).
- [x] Tài liệu liên kết từ README và 05-agents.

**Tài liệu bị ảnh hưởng:** README, 05, 07 (mới).

## 2. Kế hoạch từng phần

| Phần | Việc | File | Agent | Test cần viết |
|---|---|---|---|---|
| P1 | Tài liệu quy trình + mẫu | `docs/07-workflow.md`, `docs/tasks/*` | tự làm | — |
| P2 | Skill `/task` | `.claude/skills/task/SKILL.md` | tự làm | — |
| P3 | Hook bảo vệ main | `.claude/hooks/protect-main.mjs`, `.claude/settings.json` | tự làm | bảng trường hợp lệnh → hỏi / cho qua |

Duyệt kế hoạch: bỏ qua (người dùng giao trực tiếp yêu cầu).

## 3. Thực hiện + kiểm thử

Hook: 19/19 trường hợp đúng (merge/push/commit trên main, `checkout main && merge`, refspec `HEAD:main`, `+refs/heads/master`, `--all`, `git -C`, `gh pr merge`; cho qua `log main..develop`, `checkout main` đơn lẻ, push develop). Thử qua stdin: trả `permissionDecision: "ask"` cho `git push origin main`, không in gì cho `git status`.

Không đổi `src/`, nên không chạy 4 lệnh của app.

## 4. Review code

Reviewer: `code-reviewer` trên `protect-main.mjs`.

| # | Mức | Vấn đề | Reviewer |
|---|---|---|---|
| R1 | HIGH | `git push origin HEAD` khi đang ở main lọt qua | code-reviewer |
| R2 | HIGH | Lọt qua khi bọc trong `( )`, `{ }`, `bash -c`, `powershell -Command`, hoặc nối bằng `&` | code-reviewer |
| R3 | HIGH | `git fetch origin x:main`, `checkout -B main`, `symbolic-ref` không bị bắt | code-reviewer |
| R4 | MEDIUM | Nội dung commit message / heredoc / `--body` bị tách thành lệnh → hỏi nhầm | code-reviewer |
| R5 | MEDIUM | `gh.exe`, `FOO=1 gh`, `gh -R o/r pr merge`, `gh api …/merge` lọt qua | code-reviewer |
| R6 | MEDIUM | `git -C dir`, `cd dir; git …` dùng sai nhánh của thư mục hiện tại | code-reviewer |
| R7 | MEDIUM | `checkout main file.txt`, `switch --detach main` bị coi là chuyển nhánh | code-reviewer |
| R8 | LOW | Cờ gộp của `git branch` (`--delete --force`, `-fd`…) không khớp | code-reviewer |
| R9 | LOW | `git reset HEAD file` (unstage) trên main cũng bị hỏi | code-reviewer |

## 5. Fix bug

| Phát hiện | Xử lý |
|---|---|
| R1–R8 | đã sửa (tách lệnh theo trích dẫn, bỏ heredoc, đệ quy vào `-c`/`-Command`, theo dõi `cd` / `-C`, thêm fetch / `-B` / symbolic-ref, nhận dạng `gh` linh hoạt, regex cờ branch) |
| R9 | bỏ qua: hỏi thừa một lần trên main là chấp nhận được (nghi ngờ thì hỏi) |

Thêm `.claude/hooks/protect-main.test.mjs`: 41 trường hợp, gồm mọi lệnh trong bảng trên. Kết quả: 41/41.

## 6. Review lại

Vòng 1: chạy lại 41 trường hợp gồm các lệnh mà reviewer nêu → đúng hết. Không còn HIGH.

## 7. Final

**Tóm tắt:** Thêm quy trình 7 bước, skill `/task`, hook bảo vệ main/master, nhánh `develop`.

**Merge vào develop:** xem `docs/tasks/README.md`.

**Việc để sau:**
- Hook đọc theo cú pháp lệnh nên vẫn có thể bị lách (ví dụ chạy script chứa lệnh git). Đây là lưới an toàn, không phải hàng rào tuyệt đối.
- Bật branch protection cho `main` trên GitHub: hook chỉ chặn được Claude trên máy này.
- Nhánh `master` ở local đang ở commit đầu (`b4e7a34`), lệch với `origin/main`; cân nhắc xoá hoặc đồng bộ (cần người dùng cho phép).
