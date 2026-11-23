import Link from "next/link";
import { primaryButton } from "@/components/ui/styles";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center py-20 text-center">
      <h1 className="text-2xl font-semibold">Không tìm thấy trang</h1>
      <p className="mt-3 text-sm text-muted">Không gian hoặc dự án này không tồn tại, hoặc đã bị xoá.</p>
      <Link href="/" className={`${primaryButton} mt-6`}>
        Về Tổng quan
      </Link>
    </div>
  );
}
