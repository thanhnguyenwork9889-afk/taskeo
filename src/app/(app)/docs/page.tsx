import type { Metadata } from "next";
import { docsPageTitle, parseDocKindParam } from "@/features/docs/docs-params";
import { DocsView } from "@/features/docs/docs-view";

/**
 * Tiền tố tiêu đề ("Soạn thảo", "Bảng tính"…) nằm ở đây vì chỉ trang này biết `?type=`; phần
 * đuôi "· Taskeo" nằm ở `title.template` của root layout, vì template chỉ áp cho segment con.
 * Dùng `parseDocKindParam` chung với docs-view.tsx để `<title>` không lệch `<h1>` (vd. `?type=`
 * lặp nhiều lần: server thấy mảng, client chỉ thấy giá trị đầu — cả hai cùng coi là không lọc).
 *
 * `searchParams` là dữ liệu lúc chạy, nên `cacheComponents` đòi app khai tường minh rằng việc đó
 * là cố ý. Marker khai điều đó nằm ở src/app/(app)/layout.tsx chứ không nằm ở đây — xem giải
 * thích trong file đó (đặt marker trong trang này thì lúc prerender Next không bao giờ thấy).
 */
export async function generateMetadata({ searchParams }: PageProps<"/docs">): Promise<Metadata> {
  const kind = parseDocKindParam((await searchParams).type);
  return { title: docsPageTitle(kind) };
}

export default function DocsPage() {
  return <DocsView />;
}
