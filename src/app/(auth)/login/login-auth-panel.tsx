import Link from "next/link";
import { connection } from "next/server";
import { signInWithGoogle } from "@/server/auth/actions";
import { getAppEnv } from "@/config/app";
import { getAuthMode, missingAuthEnvVars } from "@/config/env";
import { control, cx } from "@/components/ui/styles";

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

function MisconfiguredAlert() {
  return (
    <p role="alert" className="rounded-lg bg-red-50 p-3 text-left text-sm leading-6 text-red-700">
      {getAppEnv() === "development" ? (
        <>
          Cấu hình đăng nhập chưa đủ. Thiếu biến: <code>{missingAuthEnvVars().join(", ")}</code>. Điền đủ trong{" "}
          <code>.env.local</code> rồi khởi động lại.
        </>
      ) : (
        <>
          Cấu hình đăng nhập của môi trường này chưa đủ. Quản trị viên cần đặt đủ biến môi trường trên Vercel rồi
          deploy lại.
        </>
      )}
    </p>
  );
}

function GoogleSignInForm() {
  return (
    <form action={signInWithGoogle}>
      <button
        type="submit"
        className={cx(control, "flex w-full items-center justify-center gap-3 border border-[#DCD7E6] px-4 py-3 text-sm font-semibold hover:bg-brand-faint")}
      >
        <GoogleLogo />
        Đăng nhập bằng Google
      </button>
      <label
        className={cx(
          control,
          "mt-3 flex items-start gap-3 px-3 py-2.5 text-left hover:bg-brand-faint has-focus-visible:ring-2 has-focus-visible:ring-brand",
        )}
      >
        <input
          type="checkbox"
          name="connectDrive"
          value="on"
          defaultChecked
          aria-describedby="connect-drive-hint"
          className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-brand focus-visible:outline-none"
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">Kết nối Google Drive luôn</span>
          <span id="connect-drive-hint" className="text-xs leading-5 text-[#65517F]">
            Taskeo chỉ thấy các file do Taskeo tạo hoặc bạn chọn mở.
          </span>
        </span>
      </label>
    </form>
  );
}

function DemoEntry() {
  return (
    <>
      <p role="status" className="rounded-lg bg-[#F2EDFB] p-3 text-sm leading-6 text-[#65517F]">
        Chưa cấu hình Google OAuth. Điền các biến trong <code>.env.example</code> vào <code>.env.local</code> để bật đăng nhập.
      </p>
      <Link href="/" className={cx(control, "mt-5 flex w-full items-center justify-center text-sm font-medium text-brand-ink")}>
        Vào chế độ demo →
      </Link>
    </>
  );
}

/** Khung giữ chỗ trong static shell trong lúc phần phụ thuộc cấu hình đăng nhập render theo request. */
export function LoginAuthPanelFallback() {
  return (
    <div role="status" aria-label="Đang kiểm tra cấu hình đăng nhập" className="h-12 w-full animate-pulse rounded-lg bg-brand-faint" />
  );
}

/**
 * Chế độ đăng nhập đọc biến môi trường lúc chạy (giống proxy.ts), nên phải render theo từng request
 * thay vì bị đóng băng lúc build. Đặt trong <Suspense> để phần còn lại của trang vẫn prerender.
 */
export async function LoginAuthPanel() {
  await connection();
  const mode = getAuthMode();
  if (mode === "misconfigured") return <MisconfiguredAlert />;
  if (mode === "configured") return <GoogleSignInForm />;
  return <DemoEntry />;
}
