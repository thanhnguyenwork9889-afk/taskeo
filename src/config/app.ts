// Cấu hình thuần dùng chung cho server, client và proxy.ts: không import "server-only", không dùng `@/*`.

export const APP_NAME = "Taskeo";

export const APP_ENVS = ["development", "staging", "production"] as const;
export type AppEnv = (typeof APP_ENVS)[number];

const VERCEL_ENV_MAP: Record<string, AppEnv> = {
  production: "production",
  preview: "staging",
  development: "development",
};

const APP_ENV_LABELS: Record<AppEnv, string | null> = {
  development: "Dev",
  staging: "Staging",
  production: null,
};

function isAppEnv(value: string): value is AppEnv {
  return (APP_ENVS as readonly string[]).includes(value);
}

/**
 * Xác định môi trường, theo thứ tự ưu tiên:
 * 1. NEXT_PUBLIC_APP_ENV (phải là một trong APP_ENVS).
 * 2. NEXT_PUBLIC_VERCEL_ENV: production → production, preview → staging, development → development.
 * 3. NODE_ENV === "production" → production, còn lại development.
 * Giá trị sai → ném lỗi ngay (fail fast), không đoán.
 */
export function resolveAppEnv(input: { appEnv?: string; vercelEnv?: string; nodeEnv?: string }): AppEnv {
  const { appEnv, vercelEnv, nodeEnv } = input;
  if (appEnv) {
    if (isAppEnv(appEnv)) return appEnv;
    throw new Error(
      `NEXT_PUBLIC_APP_ENV không hợp lệ: "${appEnv}". Giá trị hợp lệ: ${APP_ENVS.join(", ")}.`,
    );
  }
  if (vercelEnv) {
    // Object.hasOwn: chặn "constructor", "toString", "__proto__"… lấy nhầm thuộc tính kế thừa của Object.
    if (Object.hasOwn(VERCEL_ENV_MAP, vercelEnv)) return VERCEL_ENV_MAP[vercelEnv];
    throw new Error(
      `NEXT_PUBLIC_VERCEL_ENV không hợp lệ: "${vercelEnv}". Giá trị hợp lệ: ${Object.keys(VERCEL_ENV_MAP).join(", ")}.`,
    );
  }
  return nodeEnv === "production" ? "production" : "development";
}

export function getAppEnv(): AppEnv {
  // Phải truy cập literal `process.env.NEXT_PUBLIC_...`: Next.js chỉ thay (inline) giá trị NEXT_PUBLIC_*
  // lúc build khi viết đúng dạng này. Destructuring hay process.env[name] sẽ ra undefined ở client.
  // Vì inline lúc build, đổi biến trên Vercel phải build lại.
  return resolveAppEnv({
    appEnv: process.env.NEXT_PUBLIC_APP_ENV,
    vercelEnv: process.env.NEXT_PUBLIC_VERCEL_ENV,
    nodeEnv: process.env.NODE_ENV,
  });
}

/** Nhãn môi trường cho giao diện; production không có nhãn. */
export function appEnvLabel(env: AppEnv): string | null {
  return APP_ENV_LABELS[env];
}

/** Tiêu đề trang: "Taskeo" ở production, "Taskeo · Dev" / "Taskeo · Staging" ở môi trường khác. */
export function appTitle(env: AppEnv): string {
  const label = appEnvLabel(env);
  return label ? `${APP_NAME} · ${label}` : APP_NAME;
}
