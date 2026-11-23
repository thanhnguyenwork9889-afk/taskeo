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

`code-reviewer` trên `protect-main.mjs`: xem mục 5.

## 5. Fix bug

Xem commit `fix(T000)` nếu có.

## 6. Review lại

—

## 7. Final

**Tóm tắt:** Thêm quy trình 7 bước, skill `/task`, hook bảo vệ main/master, nhánh `develop`.

**Việc để sau:**
- Bật branch protection cho `main` trên GitHub: hook chỉ chặn được Claude trên máy này.
- Nhánh `master` ở local đang ở commit đầu (`b4e7a34`), lệch với `origin/main`; cân nhắc xoá hoặc đồng bộ (cần người dùng cho phép).
