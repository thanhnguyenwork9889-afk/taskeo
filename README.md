# Taskeo

**Taskeo** — web app cá nhân bọc Google Workspace: gom công việc, tài liệu và lịch về một màn Tổng quan, chia theo không gian (Không gian → Dự án → Công việc). Giao diện port từ prototype Figma Make (`../Workspace App Shell Design`).

## Bắt đầu nhanh

```powershell
nvm use 24.11.1
npm install
npm run dev
```

Mở http://localhost:3000. Chưa có `.env.local` thì `npm run dev` chạy **chế độ demo** (dữ liệu mẫu, không cần đăng nhập). Demo chỉ có ở môi trường development; staging / production thiếu biến là bị chặn — xem [ba môi trường](docs/01-environment.md#ba-môi-trường).

## Tài liệu (đọc theo thứ tự)

| # | Tài liệu | Nội dung |
|---|---|---|
| 01 | [Môi trường](docs/01-environment.md) | Node, ba môi trường (dev / staging / production), biến môi trường, ba chế độ chạy, các lệnh |
| 02 | [Google Cloud](docs/02-google-cloud.md) | OAuth client, scope theo giai đoạn, bảo mật token |
| 03 | [Database](docs/03-database.md) | Postgres, Prisma migrate, khác biệt so với kế hoạch |
| 04 | [Kiến trúc](docs/04-architecture.md) | Cấu trúc `src/`, quy tắc import giữa các lớp, đặt file mới ở đâu |
| 05 | [AI agents](docs/05-agents.md) | AGENTS.md, cách giao việc và kiểm tra code của agent |
| 06 | [API](docs/06-api.md) | Route hiện có, kế hoạch Giai đoạn 2 |
| 07 | [Quy trình nhiệm vụ](docs/07-workflow.md) | Nhánh theo nhiệm vụ, 7 bước, `/task`, merge vào develop |

## Cấu trúc tóm tắt

```
src/
  config/      biến môi trường
  server/      DB, auth, Google (chỉ chạy trên server)
  domain/      logic nghiệp vụ thuần + test
  store/       state phía client
  components/  ui/ dùng chung, layout/ app shell
  features/    dashboard, tasks, spaces, projects, docs, calendar
  app/         routing
docs/          tài liệu đánh số 01 → 06
prisma/        schema
```
