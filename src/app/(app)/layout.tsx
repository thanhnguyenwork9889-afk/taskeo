import { Suspense } from "react";
import { connection } from "next/server";
import { AppShell } from "@/components/layout/app-shell";
import { getViewer } from "@/server/auth/session";

async function Connection(): Promise<null> {
  await connection();
  return null;
}

/**
 * Marker "nhóm (app) có nội dung theo từng request" (mẫu trong node_modules/next/dist/docs/
 * 01-app/03-api-reference/04-functions/generate-metadata.md, mục "With Cache Components").
 *
 * /docs đọc `?type=` trong `generateMetadata`; với `cacheComponents`, Next bắt khai tường minh
 * rằng phần chạy theo request đó là cố ý, nếu không `next build` lỗi
 * `blocking-prerender-metadata-runtime`. Tài liệu bảo đặt marker trong chính trang đó, nhưng ở
 * app này vô tác dụng: lúc prerender, AppShell (client, dữ liệu ở localStorage) trả về
 * ShellSkeleton và *không* render `children`, nên không gì trong `(app)/**` được render ra HTML
 * — kiểm chứng: `await connection()` ngay thân DocsPage cũng không bị Next ghi nhận. Layout của
 * nhóm (app) là chỗ hẹp nhất còn tác dụng: nó nằm trên AppShell nên thực sự được render, và chỉ
 * bao các route trong nhóm (app) — /login và /_not-found không bị ảnh hưởng. Khi nào nội dung
 * trang render được ở server thì chuyển marker về đúng trang cần.
 *
 * Marker không render gì; <Suspense> giữ cho static shell vẫn prerender như trước.
 */
function DynamicMarker() {
  return (
    <Suspense fallback={null}>
      <Connection />
    </Suspense>
  );
}

// Layout không await session: lời gọi getViewer() được truyền xuống dạng Promise,
// chỉ những chỗ hiện tên / avatar người dùng mới chờ nó (trong <Suspense> riêng).
//
// Lưu ý chế độ demo: dữ liệu nằm trong localStorage nên server chỉ render khung chờ,
// nội dung trang được vẽ hoàn toàn ở trình duyệt. Giai đoạn 2 đưa dữ liệu lên server
// (Prisma) thì các trang mới thực sự được prerender / stream từ server.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <AppShell viewerPromise={getViewer()}>{children}</AppShell>
      <DynamicMarker />
    </>
  );
}
