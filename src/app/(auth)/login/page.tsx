import { Suspense } from "react";
import { FileSpreadsheet, FileText, FolderOpen, LayoutGrid } from "lucide-react";
import { APP_NAME } from "@/config/app";
import { LoginAuthPanel, LoginAuthPanelFallback } from "./login-auth-panel";

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center overflow-x-hidden px-6 py-10">
      <div className="mb-12 flex items-center gap-3 text-2xl font-bold tracking-tight">
        <span className="rounded-xl bg-brand p-3 text-white">
          <LayoutGrid className="h-6 w-6" aria-hidden />
        </span>
        {APP_NAME}
      </div>
      <section className="w-full max-w-[460px] rounded-2xl border border-[#E8E1F1] bg-white px-6 py-9 text-center md:px-10">
        <div aria-hidden className="relative mx-auto mb-8 flex h-32 w-48 items-center justify-center">
          <span className="absolute h-32 w-32 rounded-full bg-[#F0EBFA]" />
          <span className="absolute left-2 top-3 -rotate-12 rounded-xl border border-[#E8E1F2] bg-white p-4 text-blue-600">
            <FileText className="h-8 w-8" />
          </span>
          <span className="z-10 rounded-xl bg-brand p-5 text-white">
            <FolderOpen className="h-9 w-9" />
          </span>
          <span className="absolute bottom-0 right-1 rotate-12 rounded-xl border border-[#E8E1F2] bg-white p-4 text-emerald-700">
            <FileSpreadsheet className="h-7 w-7" />
          </span>
        </div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-[1.5px] text-brand-ink">Ít phân tán. Nhiều cảm hứng.</p>
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight">
          Một không gian.
          <br />
          Mọi điều quan trọng.
        </h1>
        <p className="mb-8 mt-4 text-sm leading-6 text-muted">
          Công việc, lịch và tài liệu Google của bạn — được sắp xếp gọn gàng để mỗi ngày nhẹ nhàng hơn.
        </p>

        <Suspense fallback={<LoginAuthPanelFallback />}>
          <LoginAuthPanel />
        </Suspense>
      </section>
      <p className="mt-8 text-xs text-muted">Không gian cho những điều quan trọng.</p>
    </main>
  );
}
