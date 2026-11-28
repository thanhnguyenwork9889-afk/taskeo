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
 * `response` (có thể chứa token, URL, body). Không bao giờ ném. Cần `reason` thì dùng
 * `driveErrorReason` (chỉ đọc đúng chuỗi đó, lọc theo danh sách cố định).
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

/** `reason` 403 do quyền truy cập file (với `drive.file`: file chưa được cấp cho app). */
const DRIVE_PERMISSION_REASONS = ["forbidden", "insufficientFilePermissions", "appNotAuthorizedToFile"] as const;

/** `reason` của lỗi 400 (request sai): chỉ để chẩn đoán trong log. */
const DRIVE_BAD_REQUEST_REASONS = ["badRequest", "invalid", "invalidParameter", "required", "fieldNotWritable"] as const;

/** `reason` do giới hạn tốc độ / hạn mức: lỗi tạm thời, không phải lỗi của file đích. */
const DRIVE_RATE_LIMIT_REASONS = [
  "rateLimitExceeded",
  "userRateLimitExceeded",
  "dailyLimitExceeded",
  "quotaExceeded",
  "sharingRateLimitExceeded",
] as const;

export type DriveErrorReason =
  | (typeof DRIVE_PERMISSION_REASONS)[number]
  | (typeof DRIVE_RATE_LIMIT_REASONS)[number]
  | (typeof DRIVE_BAD_REQUEST_REASONS)[number];

const KNOWN_REASONS: ReadonlySet<string> = new Set([...DRIVE_PERMISSION_REASONS, ...DRIVE_RATE_LIMIT_REASONS, ...DRIVE_BAD_REQUEST_REASONS]);
const RATE_LIMIT_REASONS: ReadonlySet<string> = new Set(DRIVE_RATE_LIMIT_REASONS);

function isKnownReason(value: unknown): value is DriveErrorReason {
  return typeof value === "string" && KNOWN_REASONS.has(value);
}

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined;
}

function firstReason(errors: unknown): unknown {
  return Array.isArray(errors) && errors.length > 0 ? field(errors[0], "reason") : undefined;
}

/**
 * Đọc `reason` của lỗi Google API (chỉ với lỗi gaxios), từ `response.data.error.errors[0].reason`,
 * rồi `errors[0].reason`. Chỉ đọc đúng chuỗi `reason`, không đọc `message` / `config` / header.
 * Chỉ trả giá trị nằm trong danh sách cố định (`DriveErrorReason`) nên an toàn để log; reason
 * lạ, thiếu, không phải chuỗi → `undefined`. Không bao giờ ném.
 */
export function driveErrorReason(error: unknown): DriveErrorReason | undefined {
  try {
    if (classifyDriveError(error).kind !== "google") return undefined;
    const fromResponse = firstReason(field(field(field(field(error, "response"), "data"), "error"), "errors"));
    if (fromResponse !== undefined) return isKnownReason(fromResponse) ? fromResponse : undefined;
    const fromError = firstReason(field(error, "errors"));
    return isKnownReason(fromError) ? fromError : undefined;
  } catch {
    return undefined;
  }
}

/** Reason thuộc nhóm giới hạn tốc độ / hạn mức (lỗi tạm thời). */
export function isDriveRateLimitReason(reason: DriveErrorReason | undefined): boolean {
  return reason !== undefined && RATE_LIMIT_REASONS.has(reason);
}
