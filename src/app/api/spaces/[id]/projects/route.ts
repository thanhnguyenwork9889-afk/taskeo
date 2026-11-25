import { connection } from "next/server";
import { createProjectInputSchema } from "@/domain/validation";
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
// Thư mục động bắt buộc tên `[id]` (trùng route không gian), nên `params.id` ở đây là id KHÔNG GIAN.

interface SpaceProjectsRouteContext {
  params: Promise<{ id: string }>;
}

const SPACE_NOT_FOUND_MESSAGE = "Không tìm thấy không gian";
const NAME_CONFLICT_MESSAGE = "Tên dự án đã tồn tại trong không gian này";

function spaceNotFound(): Response {
  return fail(404, SPACE_NOT_FOUND_MESSAGE);
}

/** GET /api/spaces/[id]/projects → 200 { data: Project[], error: null } | 404 */
export async function GET(_request: Request, { params }: SpaceProjectsRouteContext): Promise<Response> {
  // Không bọc try/catch: connection() báo cho Next dừng prerender tại đây.
  await connection();
  try {
    const viewer = await getApiUserId();
    if (!viewer.ok) return viewer.status === 401 ? unauthorized() : unavailable();

    const { id: spaceId } = await params;
    if (!isValidRouteId(spaceId)) return spaceNotFound();

    const { listProjects } = await import("@/server/projects");
    const projects = await listProjects(viewer.userId, spaceId);
    return projects ? ok(projects) : spaceNotFound();
  } catch (error) {
    return handleUnexpected(error, "GET /api/spaces/[id]/projects");
  }
}

/**
 * POST /api/spaces/[id]/projects { name, description?, status?, dueDate? }
 * → 201 { data: Project, error: null } | 404 không gian lạ | 409 trùng tên hoặc đủ giới hạn.
 */
export async function POST(request: Request, { params }: SpaceProjectsRouteContext): Promise<Response> {
  try {
    const viewer = await getApiUserId();
    if (!viewer.ok) return viewer.status === 401 ? unauthorized() : unavailable();

    const { id: spaceId } = await params;
    if (!isValidRouteId(spaceId)) return spaceNotFound();

    const body = await readJson(request);
    if (!body.ok) return body.response;

    const parsed = createProjectInputSchema.safeParse(body.value);
    if (!parsed.success) return validationError(parsed.error);

    const { createProject, MAX_PROJECTS_PER_SPACE } = await import("@/server/projects");
    const result = await createProject(viewer.userId, spaceId, parsed.data);
    if (result.ok) return ok(result.project, 201);

    switch (result.reason) {
      case "not_found":
        return spaceNotFound();
      case "conflict":
        return fail(409, NAME_CONFLICT_MESSAGE);
      case "limit":
        return fail(409, `Đã đạt giới hạn ${MAX_PROJECTS_PER_SPACE} dự án trong không gian này`);
    }
  } catch (error) {
    return handleUnexpected(error, "POST /api/spaces/[id]/projects");
  }
}
