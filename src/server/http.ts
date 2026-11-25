import "server-only";
import { z } from "zod";

/** Lỗi trả cho client: thông điệp ngắn, `details` chỉ có khi là lỗi validate. */
export interface ApiError {
  message: string;
  details?: unknown;
}

/** Dạng phản hồi chung của mọi API route. */
export type ApiResponse<T> = { data: T; error: null } | { data: null; error: ApiError };

export type JsonReadResult = { ok: true; value: unknown } | { ok: false; response: Response };

const INVALID_JSON_MESSAGE = "Dữ liệu gửi lên không phải JSON hợp lệ";
const VALIDATION_MESSAGE = "Dữ liệu gửi lên không hợp lệ";
const UNAUTHORIZED_MESSAGE = "Bạn cần đăng nhập để tiếp tục";
const UNAVAILABLE_MESSAGE = "Máy chủ chưa được cấu hình đăng nhập và cơ sở dữ liệu";
const UNEXPECTED_MESSAGE = "Đã có lỗi xảy ra, vui lòng thử lại sau";

export function ok<T>(data: T, status = 200): Response {
  const body: ApiResponse<T> = { data, error: null };
  return Response.json(body, { status });
}

export function fail(status: number, message: string, details?: unknown): Response {
  const error: ApiError = details === undefined ? { message } : { message, details };
  const body: ApiResponse<never> = { data: null, error };
  return Response.json(body, { status });
}

export function unauthorized(): Response {
  return fail(401, UNAUTHORIZED_MESSAGE);
}

export function unavailable(): Response {
  return fail(503, UNAVAILABLE_MESSAGE);
}

/** Lỗi Zod → 400 kèm `details = z.flattenError(err)` để client hiện lỗi theo trường. */
export function validationError(error: z.ZodError): Response {
  return fail(400, VALIDATION_MESSAGE, z.flattenError(error));
}

/** Đọc body JSON; body hỏng hoặc rỗng → phản hồi 400 dựng sẵn. */
export async function readJson(request: Request): Promise<JsonReadResult> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return { ok: false, response: fail(400, INVALID_JSON_MESSAGE) };
  }
}

/** Lỗi không lường trước: chỉ log ngữ cảnh + message (không body, không token), trả 500 chung. */
export function handleUnexpected(error: unknown, context: string): Response {
  const message = error instanceof Error ? error.message : String(error);
  console.error(context, { message });
  return fail(500, UNEXPECTED_MESSAGE);
}
