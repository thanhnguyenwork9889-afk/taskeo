import { connection } from "next/server";
import { updateTaskInputSchema } from "@/domain/validation";
import { getApiUserId } from "@/server/auth/session";
import {
  fail,
  handleUnexpected,
  isValidRouteId,
  ok,
  readJson,
  unauthorized,
  unavailable,
  validationError,
} from "@/server/http";

// `@/server/tasks` được import động: chế độ demo (503) không khởi tạo Prisma.

interface TaskRouteContext {
  params: Promise<{ id: string }>;
}

const NOT_FOUND_MESSAGE = "Không tìm thấy công việc";
const INVALID_PROJECT_MESSAGE = "Không tìm thấy dự án";

function notFound(): Response {
  return fail(404, NOT_FOUND_MESSAGE);
}

/** GET /api/tasks/[id] → 200 { data: Task, error: null } | 404 */
export async function GET(_request: Request, { params }: TaskRouteContext): Promise<Response> {
  // Không bọc try/catch: connection() báo cho Next dừng prerender tại đây.
  await connection();
  try {
    const viewer = await getApiUserId();
    if (!viewer.ok) return viewer.status === 401 ? unauthorized() : unavailable();

    const { id } = await params;
    if (!isValidRouteId(id)) return notFound();

    const { getTask } = await import("@/server/tasks");
    const task = await getTask(viewer.userId, id);
    return task ? ok(task) : notFound();
  } catch (error) {
    return handleUnexpected(error, "GET /api/tasks/[id]");
  }
}

/**
 * PATCH /api/tasks/[id] { title?, description?, status?, priority?, dueDate?, projectId? }
 * (ít nhất một trường; không nhận `spaceId` — không gian đi theo dự án)
 * → 200 { data: Task, error: null } | 400 dự án không có / của người khác | 404
 */
export async function PATCH(request: Request, { params }: TaskRouteContext): Promise<Response> {
  try {
    const viewer = await getApiUserId();
    if (!viewer.ok) return viewer.status === 401 ? unauthorized() : unavailable();

    const { id } = await params;
    if (!isValidRouteId(id)) return notFound();

    const body = await readJson(request);
    if (!body.ok) return body.response;

    const parsed = updateTaskInputSchema.safeParse(body.value);
    if (!parsed.success) return validationError(parsed.error);

    const { updateTask } = await import("@/server/tasks");
    const result = await updateTask(viewer.userId, id, parsed.data);
    if (result.ok) return ok(result.task);
    switch (result.reason) {
      case "not_found":
        return notFound();
      case "invalid_project":
        return fail(400, INVALID_PROJECT_MESSAGE);
      default: {
        const unhandled: never = result.reason;
        throw new Error(`Unhandled updateTask reason: ${String(unhandled)}`);
      }
    }
  } catch (error) {
    return handleUnexpected(error, "PATCH /api/tasks/[id]");
  }
}

/** DELETE /api/tasks/[id] → 204 (body rỗng) | 404 */
export async function DELETE(_request: Request, { params }: TaskRouteContext): Promise<Response> {
  try {
    const viewer = await getApiUserId();
    if (!viewer.ok) return viewer.status === 401 ? unauthorized() : unavailable();

    const { id } = await params;
    if (!isValidRouteId(id)) return notFound();

    const { deleteTask } = await import("@/server/tasks");
    const deleted = await deleteTask(viewer.userId, id);
    return deleted ? new Response(null, { status: 204 }) : notFound();
  } catch (error) {
    return handleUnexpected(error, "DELETE /api/tasks/[id]");
  }
}
