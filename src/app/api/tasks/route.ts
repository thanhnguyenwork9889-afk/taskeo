import { connection } from "next/server";
import {
  createTaskInputSchema,
  LIST_TASKS_QUERY_KEYS,
  listTasksQuerySchema,
  queryToObject,
} from "@/domain/validation";
import { getApiUserId } from "@/server/auth/session";
import {
  fail,
  handleUnexpected,
  ok,
  readJson,
  unauthorized,
  unavailable,
  validationError,
} from "@/server/http";

// `@/server/tasks` được import động: chế độ demo (503) không khởi tạo Prisma.

const PROJECT_NOT_FOUND_MESSAGE = "Không tìm thấy dự án";
const SPACE_NOT_FOUND_MESSAGE = "Không tìm thấy không gian";
const SPACE_MISMATCH_MESSAGE = "Không gian không khớp với dự án";

function duplicateQueryKeyMessage(key: string): string {
  return `Tham số "${key}" chỉ được gửi một lần`;
}

/**
 * GET /api/tasks?spaceId=&projectId=&status=
 * → 200 { data: Task[], error: null } | 400 query sai hoặc key lặp | 401 | 503.
 * Lọc theo không gian / dự án không có hoặc của người khác → 200 [].
 */
export async function GET(request: Request): Promise<Response> {
  // Không bọc try/catch: connection() báo cho Next dừng prerender tại đây.
  await connection();
  try {
    const viewer = await getApiUserId();
    if (!viewer.ok) return viewer.status === 401 ? unauthorized() : unavailable();

    const query = queryToObject(new URL(request.url).searchParams, LIST_TASKS_QUERY_KEYS);
    if (!query.ok) return fail(400, duplicateQueryKeyMessage(query.key));

    const parsed = listTasksQuerySchema.safeParse(query.value);
    if (!parsed.success) return validationError(parsed.error);

    const { listTasks } = await import("@/server/tasks");
    return ok(await listTasks(viewer.userId, parsed.data));
  } catch (error) {
    return handleUnexpected(error, "GET /api/tasks");
  }
}

/**
 * POST /api/tasks { title, description?, status?, priority?, dueDate?, spaceId?, projectId? }
 * → 201 { data: Task, error: null } | 400 input sai, dự án / không gian lạ hoặc không khớp
 * | 401 | 409 đủ giới hạn | 503.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const viewer = await getApiUserId();
    if (!viewer.ok) return viewer.status === 401 ? unauthorized() : unavailable();

    const body = await readJson(request);
    if (!body.ok) return body.response;

    const parsed = createTaskInputSchema.safeParse(body.value);
    if (!parsed.success) return validationError(parsed.error);

    const { createTask, MAX_TASKS_PER_USER } = await import("@/server/tasks");
    const result = await createTask(viewer.userId, parsed.data);
    if (result.ok) return ok(result.task, 201);

    switch (result.reason) {
      case "invalid_project":
        return fail(400, PROJECT_NOT_FOUND_MESSAGE);
      case "invalid_space":
        return fail(400, SPACE_NOT_FOUND_MESSAGE);
      case "space_mismatch":
        return fail(400, SPACE_MISMATCH_MESSAGE);
      case "limit":
        return fail(409, `Đã đạt giới hạn ${MAX_TASKS_PER_USER} công việc`);
      default: {
        const unhandled: never = result.reason;
        throw new Error(`Unhandled createTask reason: ${String(unhandled)}`);
      }
    }
  } catch (error) {
    return handleUnexpected(error, "POST /api/tasks");
  }
}
