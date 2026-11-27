# T014 · Thêm bước cập nhật sheet nhiệm vụ vào quy trình /task

| | |
|---|---|
| Nhánh | `docs/T014-task-sheet-step` |
| Tạo từ | `develop` @ `115f792` |
| Trạng thái | 4-review |
| Ngày tạo | 2026-11-27 |

Nguồn: không có dòng trong sheet. Người dùng chỉ ra (2026-11-27, sau T013) quy trình `/task` thiếu bước cập nhật sheet nhiệm vụ; liên quan sheet T57 (quy trình nhiệm vụ, đã xong).

## 1. Docs – yêu cầu

**Mục tiêu:** Mỗi nhiệm vụ `/task` có dòng trong sheet nhiệm vụ thì dòng đó được đánh `Đang làm` khi khởi tạo và `Xong` + ghi chú khi kết thúc, không phụ thuộc trí nhớ của phiên.

**Hiện trạng:** skill `.claude/skills/task/SKILL.md` và `docs/07-workflow.md` không nhắc tới sheet; file nhiệm vụ cũ chỉ ghi "Đóng T.. trong sheet" mà sheet không được sửa (T31 được cập nhật tay sau khi T013 merge). Repo không lưu link sheet; sheet là Sheets artifact trên claude.ai (sửa qua docs connector), không phải Google Sheet.

**Phạm vi:**
- Skill `/task`: Khởi tạo bước 7 (ghi *Nguồn*, đổi dòng sang `Đang làm`); Bước 7 thêm bước 8 (đổi `Xong`, viết lại *Ghi chú* theo mẫu, sau push); mục mới *Sheet nhiệm vụ* (link, cách sửa qua docs connector, cột, chỉ sửa D/I); báo cáo cuối lượt nêu đã cập nhật sheet chưa.
- `docs/07-workflow.md`: bảng bảy bước (hàng 7) + mục *Sheet nhiệm vụ*.
- `docs/tasks/_template.md`: dòng *Nguồn* dưới bảng đầu; dòng *Sheet nhiệm vụ* ở mục 7.

**Ngoài phạm vi:** sửa các dòng sheet cũ (T30 ghi chú cũ, T33…); sửa tên agent không tồn tại trong skill (`planner`, `typescript-reviewer`, `security-reviewer`); code.

**Tiêu chí nghiệm thu** (mỗi dòng kiểm tra được):
- [ ] Skill có bước ghi *Nguồn* + `Đang làm` lúc khởi tạo và bước `Xong` + ghi chú ở bước 7, kèm link sheet và cách sửa.
- [ ] `docs/07-workflow.md` nói cùng nội dung, không mâu thuẫn với skill.
- [ ] Template có dòng *Nguồn* và dòng *Sheet nhiệm vụ*.
- [ ] 4 lệnh typecheck / lint / test / build xanh (không đổi code).

**Tài liệu bị ảnh hưởng:** 07 quy trình.

## 2. Kế hoạch từng phần

| Phần | Việc | File | Agent | Test cần viết |
|---|---|---|---|---|
| P1 | Thêm bước sheet vào skill, workflow, template | `.claude/skills/task/SKILL.md`, `docs/07-workflow.md`, `docs/tasks/_template.md` | tự làm (chỉ docs / skill) | — |

Rủi ro / phụ thuộc:
- Sửa sheet cần docs connector trong phiên; không có thì báo người dùng tự sửa (đã ghi trong skill).

Duyệt kế hoạch: ☐ chờ · ☑ người dùng đã duyệt (2026-11-27, trả lời "Thêm vào quy trình" cho đề xuất cụ thể) · ☐ bỏ qua (`--yes`)

## 3. Thực hiện + kiểm thử

| Phần | Commit | Test thêm | typecheck | lint | test | build |
|---|---|---|---|---|---|---|
| P1 | (commit này) | — | | | | |

## 4. Review code

Reviewer đã chạy:

| # | Mức | File:dòng | Vấn đề | Reviewer |
|---|---|---|---|---|
| R1 | | | | |

## 5. Fix bug

| Phát hiện | Xử lý | Commit |
|---|---|---|

Kết quả 4 lệnh sau khi sửa:

## 6. Review lại

Vòng 1:

## 7. Final

**Tóm tắt:**

**Tiêu chí nghiệm thu:** (đánh dấu ở mục 1)

**Tài liệu đã cập nhật:**

**Merge vào develop:** commit `<hash>`, ngày

**Sheet nhiệm vụ:** không có dòng

**Việc để sau:**
-
