import { AppShell } from "@/components/layout/app-shell";
import { getViewer } from "@/server/auth/session";

// Layout không await session: lời gọi getViewer() được truyền xuống dạng Promise,
// chỉ những chỗ hiện tên / avatar người dùng mới chờ nó (trong <Suspense> riêng).
//
// Lưu ý chế độ demo: dữ liệu nằm trong localStorage nên server chỉ render khung chờ,
// nội dung trang được vẽ hoàn toàn ở trình duyệt. Giai đoạn 2 đưa dữ liệu lên server
// (Prisma) thì các trang mới thực sự được prerender / stream từ server.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return <AppShell viewerPromise={getViewer()}>{children}</AppShell>;
}
