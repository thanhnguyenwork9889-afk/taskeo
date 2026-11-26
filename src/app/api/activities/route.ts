import { connection } from "next/server";
import { LIST_ACTIVITIES_QUERY_KEYS, listActivitiesQuerySchema, queryToObject } from "@/domain/validation";
import { getApiUserId } from "@/server/auth/session";
import {
  duplicateQueryKeyMessage,
  fail,
  handleUnexpected,
  ok,
  unauthorized,
  unavailable,
  validationError,
} from "@/server/http";

// `@/server/activities` được import động: chế độ demo (503) không khởi tạo Prisma.

/**
 * GET /api/activities?limit=
 * → 200 { data: Activity[], error: null } (mới nhất trước; `limit` 1–200, mặc định 50)
 * | 400 limit sai hoặc key lặp | 401 | 503.
 */
export async function GET(request: Request): Promise<Response> {
  // Không bọc try/catch: connection() báo cho Next dừng prerender tại đây.
  await connection();
  try {
    const viewer = await getApiUserId();
    if (!viewer.ok) return viewer.status === 401 ? unauthorized() : unavailable();

    const query = queryToObject(new URL(request.url).searchParams, LIST_ACTIVITIES_QUERY_KEYS);
    if (!query.ok) return fail(400, duplicateQueryKeyMessage(query.key));

    const parsed = listActivitiesQuerySchema.safeParse(query.value);
    if (!parsed.success) return validationError(parsed.error);

    const { listActivities } = await import("@/server/activities");
    return ok(await listActivities(viewer.userId, parsed.data.limit));
  } catch (error) {
    return handleUnexpected(error, "GET /api/activities");
  }
}
