import { connection } from "next/server";
import { updateProjectInputSchema } from "@/domain/validation";
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

// `@/server/projects` được import động: chế độ demo (503) không khởi tạo Prisma.

interface ProjectRouteContext {
  params: Promise<{ id: string }>;
}

const NOT_FOUND_MESSAGE = "Không tìm thấy dự án";
const CONFLICT_MESSAGE = "Tên dự án đã tồn tại trong không gian này";

function notFound(): Response {
  return fail(404, NOT_FOUND_MESSAGE);
}

/** GET /api/projects/[id] → 200 { data: Project, error: null } | 404 */
export async function GET(_request: Request, { params }: ProjectRouteContext): Promise<Response> {
  // Không bọc try/catch: connection() báo cho Next dừng prerender tại đây.
  await connection();
  try {
    const viewer = await getApiUserId();
    if (!viewer.ok) return viewer.status === 401 ? unauthorized() : unavailable();

    const { id } = await params;
    if (!isValidRouteId(id)) return notFound();

    const { getProject } = await import("@/server/projects");
    const project = await getProject(viewer.userId, id);
    return project ? ok(project) : notFound();
  } catch (error) {
    return handleUnexpected(error, "GET /api/projects/[id]");
  }
}

/**
 * PATCH /api/projects/[id] { name?, description?, status?, dueDate? } (ít nhất một trường)
 * → 200 { data: Project, error: null } | 404 | 409 trùng tên trong không gian
 */
export async function PATCH(request: Request, { params }: ProjectRouteContext): Promise<Response> {
  try {
    const viewer = await getApiUserId();
    if (!viewer.ok) return viewer.status === 401 ? unauthorized() : unavailable();

    const { id } = await params;
    if (!isValidRouteId(id)) return notFound();

    const body = await readJson(request);
    if (!body.ok) return body.response;

    const parsed = updateProjectInputSchema.safeParse(body.value);
    if (!parsed.success) return validationError(parsed.error);

    const { updateProject } = await import("@/server/projects");
    const result = await updateProject(viewer.userId, id, parsed.data);
    if (result.ok) return ok(result.project);
    return result.reason === "conflict" ? fail(409, CONFLICT_MESSAGE) : notFound();
  } catch (error) {
    return handleUnexpected(error, "PATCH /api/projects/[id]");
  }
}

/** DELETE /api/projects/[id] → 204 (body rỗng) | 404. Công việc của dự án giữ lại với `projectId = null`. */
export async function DELETE(_request: Request, { params }: ProjectRouteContext): Promise<Response> {
  try {
    const viewer = await getApiUserId();
    if (!viewer.ok) return viewer.status === 401 ? unauthorized() : unavailable();

    const { id } = await params;
    if (!isValidRouteId(id)) return notFound();

    const { deleteProject } = await import("@/server/projects");
    const deleted = await deleteProject(viewer.userId, id);
    return deleted ? new Response(null, { status: 204 }) : notFound();
  } catch (error) {
    return handleUnexpected(error, "DELETE /api/projects/[id]");
  }
}
