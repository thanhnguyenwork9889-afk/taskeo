import { DOC_KIND_LABEL } from "@/domain/labels";
import type { DocKind } from "@/domain/types";
import { docKindSchema } from "@/domain/validation";

// Parser `?type=` của trang /docs, dùng chung cho server và client (T019): `generateMetadata`
// trong app/(app)/docs/page.tsx đọc `searchParams` được `string | string[] | undefined`, còn
// docs-view.tsx đọc `useSearchParams().get("type")` được `string | null`. Hai bên cùng gọi hàm
// này để `<title>` không lệch `<h1>` (vd. `?type=doc&type=sheet`: server thấy mảng, client chỉ
// thấy "doc"). Vì vậy file không có JSX và không "use client".

/** Tiêu đề khi không lọc theo loại (không có `?type=` hoặc `?type=` không hợp lệ). */
export const DOCS_LIBRARY_TITLE = "Kho lưu trữ";

/**
 * Giá trị `?type=` → loại tài liệu. Thiếu, rỗng, không thuộc 3 loại (phân biệt hoa thường),
 * hoặc lặp nhiều lần (`?type=doc&type=sheet`: yêu cầu không rõ ràng) → `null`, tức không lọc.
 */
export function parseDocKindParam(value: string | string[] | null | undefined): DocKind | null {
  const raw = Array.isArray(value) ? (value.length === 1 ? value[0] : undefined) : value;
  if (typeof raw !== "string") return null;
  const parsed = docKindSchema.safeParse(raw.trim());
  return parsed.success ? parsed.data : null;
}

/** Tiêu đề trang /docs theo loại đã lọc; không lọc → `DOCS_LIBRARY_TITLE`. */
export function docsPageTitle(kind: DocKind | null): string {
  return kind ? DOC_KIND_LABEL[kind] : DOCS_LIBRARY_TITLE;
}
