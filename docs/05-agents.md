# 05 · AI agents

## AGENTS.md

`AGENTS.md` ở gốc repo do `next dev` tự sinh và tự thêm lại (xem `node_modules/next/dist/server/lib/generate-agent-files.js`). Nội dung chính: bản Next.js này có thay đổi lớn, agent phải đọc tài liệu trong `node_modules/next/dist/docs/` trước khi viết code.

Đừng xoá khối này. Xoá đi thì lần chạy `next dev` sau sẽ thêm lại, tạo ra thay đổi chưa commit.

## Subagent của repo

Định nghĩa trong `.claude/agents/`. Claude Code tự chọn agent theo mô tả, hoặc gọi đích danh ("dùng api-builder để…").

| Agent | Việc | Sửa code? | Model |
|---|---|---|---|
| `feature-builder` | Trang, màn hình trong `features/`, hàm thuần trong `domain/` (TDD) | Có | theo phiên |
| `api-builder` | Giai đoạn 2: API route + Prisma + Zod, hàm truy vấn trong `server/`, thay store bằng TanStack Query | Có | theo phiên |
| `google-integrator` | Auth.js, scope theo giai đoạn, mã hoá token, Drive (GĐ 3), Calendar (GĐ 4) | Có | theo phiên |
| `layer-reviewer` | Review diff theo quy ước riêng của repo (ranh giới lớp, server-only, chế độ demo, docs đi kèm) | Không | sonnet |
| `verifier` | Chạy typecheck, lint, test, build và báo kết quả | Không | haiku |

Ba agent viết code chia theo vùng file nên không giẫm lên nhau. Review chung về TypeScript và bảo mật vẫn dùng agent ECC toàn cục (`typescript-reviewer`, `security-reviewer`); `layer-reviewer` chỉ lo phần riêng của repo này.

Luồng thường dùng:

```
feature-builder / api-builder / google-integrator   viết code + test
        ↓
verifier                                            bốn lệnh kiểm tra
        ↓
layer-reviewer  (+ security-reviewer nếu đụng auth, token, API route)
        ↓
commit
```

Sửa quy tắc trong `docs/04-architecture.md` thì rà lại các file trong `.claude/agents/` cho khớp: agent đọc tài liệu trước, nhưng danh sách kiểm tra trong `layer-reviewer.md` cũng ghi lại các luật.

## Khi giao việc cho agent

Cho agent đọc theo thứ tự:

1. [04-architecture.md](04-architecture.md): file nằm ở đâu, lớp nào được import lớp nào.
2. Tài liệu của bước đang làm (02 Google Cloud, 03 database, 06 API).
3. `node_modules/next/dist/docs/` cho API của Next.js.

Sau khi agent sửa code, chạy đủ bốn lệnh kiểm tra:

```powershell
npm run typecheck
```

```powershell
npm run lint
```

```powershell
npm test
```

```powershell
npm run build
```
