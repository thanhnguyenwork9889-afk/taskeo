import { connection } from "next/server";
import { createSpaceInputSchema } from "@/domain/validation";
import { getApiUserId } from "@/server/auth/session";
import { fail, handleUnexpected, ok, readJson, unauthorized, unavailable, validationError } from "@/server/http";

// `@/server/spaces` được import động: chế độ demo (503) không khởi tạo Prisma.

/** GET /api/spaces → 200 { data: Space[], error: null } */
export async function GET(): Promise<Response> {
  // Không bọc try/catch: connection() báo cho Next dừng prerender tại đây.
  await connection();
  try {
    const viewer = await getApiUserId();
    if (!viewer.ok) return viewer.status === 401 ? unauthorized() : unavailable();
    const { listSpaces } = await import("@/server/spaces");
    return ok(await listSpaces(viewer.userId));
  } catch (error) {
    return handleUnexpected(error, "GET /api/spaces");
  }
}

/**
 * POST /api/spaces { name, description?, color?, icon? } → 201 { data: Space, error: null }
 * Đã đủ MAX_SPACES → 409.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const viewer = await getApiUserId();
    if (!viewer.ok) return viewer.status === 401 ? unauthorized() : unavailable();

    const body = await readJson(request);
    if (!body.ok) return body.response;

    const parsed = createSpaceInputSchema.safeParse(body.value);
    if (!parsed.success) return validationError(parsed.error);

    const { createSpace, MAX_SPACES } = await import("@/server/spaces");
    const result = await createSpace(viewer.userId, parsed.data);
    if (!result.ok) return fail(409, `Đã đạt giới hạn ${MAX_SPACES} không gian`);
    return ok(result.space, 201);
  } catch (error) {
    return handleUnexpected(error, "POST /api/spaces");
  }
}
