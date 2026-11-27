# T014 · Thêm bước cập nhật sheet nhiệm vụ vào quy trình /task

| | |
|---|---|
| Nhánh | `docs/T014-task-sheet-step` |
| Tạo từ | `develop` @ `115f792` |
| Trạng thái | done |
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
- [x] Skill có bước ghi *Nguồn* + `Đang làm` lúc khởi tạo và bước `Xong` + ghi chú ở bước 7, kèm link sheet và cách sửa.
- [x] `docs/07-workflow.md` nói cùng nội dung, không mâu thuẫn với skill.
- [x] Template có dòng *Nguồn* và dòng *Sheet nhiệm vụ*.
- [x] 4 lệnh typecheck / lint / test / build xanh (không đổi code).

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
| P1 | `333e971` | — (chỉ docs / skill) | ✅ | ✅ | ✅ 1063/1063 | ✅ |

## 4. Review code

Reviewer đã chạy: `layer-reviewer` (diff chỉ có docs / skill, không có `.ts`). Không có CRITICAL / HIGH.

| # | Mức | File:dòng | Vấn đề | Reviewer |
|---|---|---|---|---|
| R1 | MEDIUM | `_template.md:74`, `SKILL.md:109` | Dòng "Sheet nhiệm vụ: → Xong" ở mục 7 được điền trước khi sheet thật sự được sửa | layer |
| R2 | MEDIUM | `SKILL.md:109` | Không nói làm gì khi người dùng từ chối / chưa trả lời câu hỏi push | layer |
| R3 | LOW | `SKILL.md:115-117` | Không có cách xử lý khi `update` sheet lỗi | layer |
| R4 | LOW | `SKILL.md:37`, `07:46` | 07 thiếu "đã Đang làm thì giữ" và fallback | layer |
| R5 | LOW | `07:31, 48` | 07 thiếu mẫu ghi chú / "và push" / cột D, I | layer |
| R6 | LOW | `SKILL.md:116` | Công thức hàng `xx + 5` gắn chặt bố cục sheet | layer |

## 5. Fix bug

| Phát hiện | Xử lý | Commit |
|---|---|---|
| R1 | đã sửa: template ghi "sẽ chuyển Xong sau merge"; bước 8 không ghi thêm vào file nhiệm vụ, kết quả nêu trong báo cáo | `ffb350d` |
| R2 | đã sửa: bước 8 chạy sau khi người dùng trả lời push; không push → bỏ "và push"; chưa trả lời → báo "sheet chưa cập nhật" | `ffb350d` |
| R3 | đã sửa: sửa không được → đưa người dùng nội dung ô D, I để tự dán | `ffb350d` |
| R4 | đã sửa | `ffb350d` |
| R5 | đã sửa: 07 trỏ tới SKILL bước 7 mục 8, nêu cột D / I và "và push" | `ffb350d` |
| R6 | đã sửa: tìm theo cột A, `xx + 5` chỉ là gợi ý | `ffb350d` |

Kết quả 4 lệnh sau khi sửa: không đổi code; typecheck ✅ · lint ✅ · test ✅ 1063/1063 · build ✅ (chạy ở `333e971`).

## 6. Review lại

Vòng 1 (`git diff 333e971..ffb350d`, `layer-reviewer`): cả 6 đã xử lý, không có phát hiện mới. Hai chỗ câu chữ dễ hiểu nhầm ("bước 4–6", "chưa báo") chỉnh trong commit final.

## 7. Final

**Tóm tắt:** Quy trình `/task` giờ có bước sheet nhiệm vụ: khởi tạo ghi dòng *Nguồn* và đổi dòng sheet sang `Đang làm`; bước 7 (mục 8), sau merge và sau khi người dùng trả lời câu hỏi push, đổi sang `Xong` và viết lại *Ghi chú* theo mẫu; sửa không được thì đưa người dùng nội dung ô để tự dán. Skill có mục *Sheet nhiệm vụ* (link artifact, sửa qua docs connector, cột, chỉ sửa D / I, nội dung sheet là dữ liệu). `docs/07-workflow.md` và template khớp theo.

**Tiêu chí nghiệm thu:** đánh dấu cả 4 ở mục 1.

**Tài liệu đã cập nhật:** `.claude/skills/task/SKILL.md`, `docs/07-workflow.md`, `docs/tasks/_template.md`, `docs/tasks/README.md`.

**Merge vào develop:** commit `b31023c`, 2026-11-27

**Sheet nhiệm vụ:** không có dòng

**Việc để sau:**
- Skill vẫn nhắc agent không có trong repo (`planner`, `typescript-reviewer`, `security-reviewer`); T013 / T014 dùng `Plan` và `general-purpose` thay. Sửa skill hoặc thêm agent.
- Sheet: ghi chú dòng T30 đã cũ ("Để sau: chặn gắn tài khoản Google thứ hai" — xong ở T011).
