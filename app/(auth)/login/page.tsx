import Link from "next/link";
import { FileSpreadsheet, FileText, FolderOpen, LayoutGrid } from "lucide-react";
import { signInWithGoogle } from "@/app/actions/auth";
import { getAuthMode, missingAuthEnvVars } from "@/lib/auth-config";
import { control, cx } from "@/lib/ui";

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden>
      <path fill="#4285F4" d="M22 12.2c0-.7-.1-1.4-.2-2.2H12v4h5.6a4.8 4.8 0 0 1-2.1 3.1v2.6H19c2-1.9 3-4.5 3-7.5Z" />
      <path fill="#34A853" d="M12 22c2.8 0 5.2-.9 7-2.3l-3.5-2.6c-.9.6-2.1 1-3.5 1-2.7 0-5-1.8-5.8-4.2H2.6v2.7A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.2 13.9a6 6 0 0 1 0-3.8V7.4H2.6a10 10 0 0 0 0 9.2Z" />
      <path fill="#EA4335" d="M12 5.9c1.6 0 3 .6 4.1 1.6l3.1-3A10 10 0 0 0 2.6 7.4l3.6 2.7A6.1 6.1 0 0 1 12 5.9Z" />
    </svg>
  );
}

export default function LoginPage() {
  const mode = getAuthMode();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center overflow-x-hidden px-6 py-10">
      <div className="mb-12 flex items-center gap-3 text-2xl font-bold tracking-tight">
        <span className="rounded-xl bg-brand p-3 text-white">
          <LayoutGrid className="h-6 w-6" aria-hidden />
        </span>
        Workspace
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

        {mode === "misconfigured" && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-left text-sm leading-6 text-red-700">
            Cấu hình đăng nhập chưa đủ. Thiếu biến: <code>{missingAuthEnvVars().join(", ")}</code>. Điền đủ trong <code>.env.local</code> rồi khởi động lại.
          </p>
        )}
        {mode === "configured" && (
          <form action={signInWithGoogle}>
            <button
              type="submit"
              className={cx(control, "flex w-full items-center justify-center gap-3 border border-[#DCD7E6] px-4 py-3 text-sm font-semibold hover:bg-brand-faint")}
            >
              <GoogleLogo />
              Đăng nhập bằng Google
            </button>
          </form>
        )}
        {mode === "demo" && (
          <>
            <p role="status" className="rounded-lg bg-[#F2EDFB] p-3 text-sm leading-6 text-[#65517F]">
              Chưa cấu hình Google OAuth. Điền các biến trong <code>.env.example</code> vào <code>.env.local</code> để bật đăng nhập.
            </p>
            <Link href="/" className={cx(control, "mt-5 flex w-full items-center justify-center text-sm font-medium text-brand-ink")}>
              Vào chế độ demo →
            </Link>
          </>
        )}
      </section>
      <p className="mt-8 text-xs text-muted">Không gian cho những điều quan trọng.</p>
    </main>
  );
}
