import "server-only";

export type DriveErrorKind = "not_connected" | "scope_missing" | "timeout" | "google" | "unknown";

export interface DriveErrorInfo {
  kind: DriveErrorKind;
  name: string;
  status?: number;
}

/** Symbol gaxios 8 gắn lên mọi GaxiosError: `Symbol.for(\`${pkg.name}-gaxios-error\`)`. */
const GAXIOS_ERROR_SYMBOL = Symbol.for("gaxios-gaxios-error");
const TIMEOUT_NAMES = new Set(["TimeoutError", "AbortError"]);

function readString(obj: object, key: "name" | "code"): string | undefined {
  const value: unknown = (obj as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function validStatus(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599
    ? value
    : undefined;
}

function classify(error: unknown): DriveErrorInfo {
  if (typeof error !== "object" || error === null) return { kind: "unknown", name: "UnknownError" };

  const name = readString(error, "name");
  if (name === "GoogleNotConnectedError") return { kind: "not_connected", name };
  if (name === "GoogleScopeMissingError") return { kind: "scope_missing", name };

  const code = readString(error, "code");
  if (name && TIMEOUT_NAMES.has(name)) return { kind: "timeout", name };
  if (code && TIMEOUT_NAMES.has(code)) return { kind: "timeout", name: code };

  // GaxiosError mang config.headers.Authorization, config.url, response: chỉ kiểm tra
  // sự có mặt của `config` bằng `in`, chỉ đọc `status`.
  const rawStatus: unknown = (error as Record<string, unknown>).status;
  const isGaxios =
    GAXIOS_ERROR_SYMBOL in error || (typeof rawStatus === "number" && "config" in error);
  if (isGaxios) {
    const status = validStatus(rawStatus);
    return status === undefined
      ? { kind: "google", name: "GaxiosError" }
      : { kind: "google", name: "GaxiosError", status };
  }

  if (error instanceof Error && name) return { kind: "unknown", name };
  return { kind: "unknown", name: "UnknownError" };
}

/**
 * Phân loại lỗi khi gọi Drive để log ngắn gọn. Chỉ đọc `name`, `code`, `status` và
 * kiểm tra có mặt symbol gaxios / `config`; không bao giờ đọc `message`, `config`,
 * `response` (có thể chứa token, URL, body). Không bao giờ ném.
 */
export function classifyDriveError(error: unknown): DriveErrorInfo {
  try {
    return classify(error);
  } catch {
    return { kind: "unknown", name: "UnknownError" };
  }
}

/** Trường an toàn để log: tên lỗi đã phân loại và mã HTTP nếu có. */
export function driveErrorLogFields(error: unknown): { error: string; status?: number } {
  const info = classifyDriveError(error);
  return info.status === undefined ? { error: info.name } : { error: info.name, status: info.status };
}

/** Chưa kết nối / thiếu scope là trạng thái bình thường, không log. */
export function isSilentDriveError(kind: DriveErrorKind): boolean {
  return kind === "not_connected" || kind === "scope_missing";
}
