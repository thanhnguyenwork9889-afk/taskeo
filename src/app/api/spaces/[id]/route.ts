import { connection } from "next/server";
import { updateSpaceInputSchema } from "@/domain/validation";
import { getApiUserId } from "@/server/auth/session";
import { fail, handleUnexpected, ok, readJson, unauthorized, unavailable, validationError } from "@/server/http";

// `@/server/spaces` được import động: chế độ demo (503) không khởi tạo Prisma.

interface SpaceRouteContext {
  params: Promise<{ id: string }>;
}

const MAX_ID_LENGTH = 64;
const NOT_FOUND_MESSAGE = "Không tìm thấy không gian";

/** id rỗng hoặc quá dài → coi như không tồn tại (404), không gọi DB. */
function isValidId(id: string): boolean {
  return id.length > 0 && id.length <= MAX_ID_LENGTH;
}

function notFound(): Response {
  return fail(404, NOT_FOUND_MESSAGE);
}

/** GET /api/spaces/[id] → 200 { data: Space, error: null } | 404 */
export async function GET(_request: Request, { params }: SpaceRouteContext): Promise<Response> {
  // Không bọc try/catch: connection() báo cho Next dừng prerender tại đây.
  await connection();
  try {
    const viewer = await getApiUserId();
    if (!viewer.ok) return viewer.status === 401 ? unauthorized() : unavailable();

    const { id } = await params;
    if (!isValidId(id)) return notFound();

    const { getSpace } = await import("@/server/spaces");
    const space = await getSpace(viewer.userId, id);
    return space ? ok(space) : notFound();
  } catch (error) {
    return handleUnexpected(error, "GET /api/spaces/[id]");
  }
}

/** PATCH /api/spaces/[id] { name?, description?, color?, icon? } (ít nhất một trường) → 200 { data: Space, error: null } | 404 */
export async function PATCH(request: Request, { params }: SpaceRouteContext): Promise<Response> {
  try {
    const viewer = await getApiUserId();
    if (!viewer.ok) return viewer.status === 401 ? unauthorized() : unavailable();

    const { id } = await params;
    if (!isValidId(id)) return notFound();

    const body = await readJson(request);
    if (!body.ok) return body.response;

    const parsed = updateSpaceInputSchema.safeParse(body.value);
    if (!parsed.success) return validationError(parsed.error);

    const { updateSpace } = await import("@/server/spaces");
    const space = await updateSpace(viewer.userId, id, parsed.data);
    return space ? ok(space) : notFound();
  } catch (error) {
    return handleUnexpected(error, "PATCH /api/spaces/[id]");
  }
}

/** DELETE /api/spaces/[id] → 204 (body rỗng) | 404 */
export async function DELETE(_request: Request, { params }: SpaceRouteContext): Promise<Response> {
  try {
    const viewer = await getApiUserId();
    if (!viewer.ok) return viewer.status === 401 ? unauthorized() : unavailable();

    const { id } = await params;
    if (!isValidId(id)) return notFound();

    const { deleteSpace } = await import("@/server/spaces");
    const deleted = await deleteSpace(viewer.userId, id);
    return deleted ? new Response(null, { status: 204 }) : notFound();
  } catch (error) {
    return handleUnexpected(error, "DELETE /api/spaces/[id]");
  }
}
