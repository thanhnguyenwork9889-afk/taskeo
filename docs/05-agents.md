# 05 · AI agents

## AGENTS.md

`AGENTS.md` ở gốc repo do `next dev` tự sinh và tự thêm lại (xem `node_modules/next/dist/server/lib/generate-agent-files.js`). Nội dung chính: bản Next.js này có thay đổi lớn, agent phải đọc tài liệu trong `node_modules/next/dist/docs/` trước khi viết code.

Đừng xoá khối này. Xoá đi thì lần chạy `next dev` sau sẽ thêm lại, tạo ra thay đổi chưa commit.

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
