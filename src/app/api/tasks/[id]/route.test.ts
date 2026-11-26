import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@/domain/types";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(async () => undefined),
  getApiUserId: vi.fn(),
  getTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  serverImported: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("@/server/auth/session", () => ({ getApiUserId: mocks.getApiUserId }));
// Factory đặt tên để `freshRoute` đăng ký lại bằng `vi.doMock` (xoá kết quả mock đã cache).
const serverTasksModule = vi.hoisted(() => () => {
  mocks.serverImported();
  return {
    getTask: mocks.getTask,
    updateTask: mocks.updateTask,
    deleteTask: mocks.deleteTask,
  };
});

vi.mock("@/server/tasks", serverTasksModule);

import { DELETE, GET, PATCH } from "./route";

const TASK: Task = {
  id: "tk_1",
  spaceId: "sp_1",
  projectId: "pr_1",
  title: "Viết báo cáo",
  description: "",
  status: "TODO",
  priority: "MEDIUM",
  dueDate: "2026-12-31",
  completedAt: null,
  addToCalendar: false,
  linkedFileIds: [],
  createdAt: "2026-11-25T00:00:00.000Z",
  updatedAt: "2026-11-25T00:00:00.000Z",
};

const TASK_URL = "http://localhost/api/tasks/tk_1";
const NOT_FOUND = "Không tìm thấy công việc";
const INVALID_PROJECT = "Không tìm thấy dự án";

function context(id = "tk_1") {
  return { params: Promise.resolve({ id }) };
}

function getRequest(): Request {
  return new Request(TASK_URL);
}

function patchRequest(body: string): Request {
  return new Request(TASK_URL, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body,
  });
}

function patchJson(value: unknown): Request {
  return patchRequest(JSON.stringify(value));
}

function deleteRequest(): Request {
  return new Request(TASK_URL, { method: "DELETE" });
}

function expectNoServerCall(): void {
  expect(mocks.getTask).not.toHaveBeenCalled();
  expect(mocks.updateTask).not.toHaveBeenCalled();
  expect(mocks.deleteTask).not.toHaveBeenCalled();
}

type RouteModule = typeof import("./route");

/** Handler import tĩnh; test 401 / 503 truyền `await freshRoute()` thay vào. */
const STATIC_ROUTE: RouteModule = { GET, PATCH, DELETE };

const CALLS = [
  ["GET", (id: string, route: RouteModule) => route.GET(getRequest(), context(id))],
  ["PATCH", (id: string, route: RouteModule) => route.PATCH(patchJson({ title: "A" }), context(id))],
  ["DELETE", (id: string, route: RouteModule) => route.DELETE(deleteRequest(), context(id))],
] as const;

/**
 * Nạp lại route với module cache sạch: factory `vi.mock("@/server/tasks")` chạy lại nếu route
 * (tĩnh hoặc động) import `@/server/tasks`, nên `serverImported` phản ánh đúng lần gọi này.
 */
async function freshRoute(): Promise<RouteModule> {
  // resetModules không xoá kết quả mock đã cache ("mock:*"); doMock đăng ký lại và xoá cache đó.
  vi.resetModules();
  vi.doMock("@/server/tasks", serverTasksModule);
  return import("./route");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.getApiUserId.mockResolvedValue({ ok: true, userId: "user_1" });
});

describe.each(CALLS)("%s /api/tasks/[id] — phiên và id", (_method, call) => {
  it("trả 401 khi chưa đăng nhập, không import và không gọi hàm server", async () => {
    mocks.getApiUserId.mockResolvedValue({ ok: false, status: 401 });
    const response = await call("tk_1", await freshRoute());
    expect(response.status).toBe(401);
    expect((await response.json()).data).toBeNull();
    expect(mocks.serverImported).not.toHaveBeenCalled();
    expectNoServerCall();
  });

  it("trả 503 ở chế độ demo, không import và không gọi hàm server", async () => {
    mocks.getApiUserId.mockResolvedValue({ ok: false, status: 503 });
    const response = await call("tk_1", await freshRoute());
    expect(response.status).toBe(503);
    expect(mocks.serverImported).not.toHaveBeenCalled();
    expectNoServerCall();
  });

  it.each([
    ["quá 64 ký tự", "a".repeat(65)],
    ["rỗng", ""],
    ["có ký tự NUL", "tk\u00001"],
  ])("trả 404 khi id %s và không gọi hàm server", async (_label, id) => {
    const response = await call(id, STATIC_ROUTE);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ data: null, error: { message: NOT_FOUND } });
    expectNoServerCall();
  });
});

describe("GET /api/tasks/[id]", () => {
  it("chờ connection() trước khi đọc phiên", async () => {
    mocks.getTask.mockResolvedValue(TASK);
    await GET(getRequest(), context());
    expect(mocks.connection).toHaveBeenCalledTimes(1);
    expect(mocks.connection.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.getApiUserId.mock.invocationCallOrder[0],
    );
  });

  it.each([
    ["id lạ", "tk_missing"],
    ["của người khác", "tk_other"],
  ])("trả 404 khi %s", async (_label, id) => {
    mocks.getTask.mockResolvedValue(null);
    const response = await GET(getRequest(), context(id));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ data: null, error: { message: NOT_FOUND } });
    expect(mocks.getTask).toHaveBeenCalledWith("user_1", id);
  });

  it("trả 200 với công việc", async () => {
    mocks.getTask.mockResolvedValue(TASK);
    const response = await GET(getRequest(), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: TASK, error: null });
    expect(mocks.getTask).toHaveBeenCalledWith("user_1", "tk_1");
  });

  it("trả 500 thông báo chung khi DB lỗi, không lộ message", async () => {
    mocks.getTask.mockRejectedValue(new Error("PrismaClientKnownRequestError: secret table"));
    const response = await GET(getRequest(), context());
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain("Prisma");
    expect(text).not.toContain("secret");
    expect(console.error).toHaveBeenCalled();
  });
});

describe("PATCH /api/tasks/[id]", () => {
  it("trả 400 khi body không phải JSON hợp lệ", async () => {
    const response = await PATCH(patchRequest("{ title: "), context());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      data: null,
      error: { message: "Dữ liệu gửi lên không phải JSON hợp lệ" },
    });
    expect(mocks.updateTask).not.toHaveBeenCalled();
  });

  it("trả 400 khi body rỗng {}", async () => {
    const response = await PATCH(patchJson({}), context());
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.data).toBeNull();
    expect(body.error.details.formErrors.length).toBeGreaterThan(0);
    expect(mocks.updateTask).not.toHaveBeenCalled();
  });

  it.each([
    ["spaceId (chỉ spaceId)", { spaceId: "x" }],
    ["userId", { title: "A", userId: "user_2" }],
    ["completedAt", { title: "A", completedAt: "2026-11-25T00:00:00.000Z" }],
    ["order", { title: "A", order: 1 }],
  ])("trả 400 khi gửi key thừa %s (chặn mass assignment)", async (_key, payload) => {
    const response = await PATCH(patchJson(payload), context());
    expect(response.status).toBe(400);
    expect((await response.json()).error.details.formErrors.length).toBeGreaterThan(0);
    expect(mocks.updateTask).not.toHaveBeenCalled();
  });

  it("trả 400 khi status lạ", async () => {
    const response = await PATCH(patchJson({ status: "FOO" }), context());
    expect(response.status).toBe(400);
    expect((await response.json()).error.details.fieldErrors.status).toBeDefined();
    expect(mocks.updateTask).not.toHaveBeenCalled();
  });

  it("trả 400 khi dự án không có hoặc của người khác", async () => {
    mocks.updateTask.mockResolvedValue({ ok: false, reason: "invalid_project" });
    const response = await PATCH(patchJson({ projectId: "pr_other" }), context());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ data: null, error: { message: INVALID_PROJECT } });
    expect(mocks.updateTask).toHaveBeenCalledWith("user_1", "tk_1", { projectId: "pr_other" });
  });

  it.each([
    ["id lạ", "tk_missing"],
    ["của người khác", "tk_other"],
  ])("trả 404 khi %s", async (_label, id) => {
    mocks.updateTask.mockResolvedValue({ ok: false, reason: "not_found" });
    const response = await PATCH(patchJson({ title: "A" }), context(id));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ data: null, error: { message: NOT_FOUND } });
    expect(mocks.updateTask).toHaveBeenCalledWith("user_1", id, { title: "A" });
  });

  it("trả 200 và chỉ truyền các trường gửi lên (đã parse)", async () => {
    const updated: Task = { ...TASK, title: "Mới", dueDate: null, projectId: null };
    mocks.updateTask.mockResolvedValue({ ok: true, task: updated });
    const response = await PATCH(
      patchJson({ title: "  Mới  ", dueDate: null, projectId: null }),
      context(),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: updated, error: null });
    expect(mocks.updateTask).toHaveBeenCalledTimes(1);
    const [userId, id, input] = mocks.updateTask.mock.calls[0];
    expect(userId).toBe("user_1");
    expect(id).toBe("tk_1");
    expect(input).toStrictEqual({ title: "Mới", dueDate: null, projectId: null });
  });

  it("trả 500 thông báo chung khi DB lỗi, không lộ message", async () => {
    mocks.updateTask.mockRejectedValue(new Error("Unique constraint failed on secret_column"));
    const response = await PATCH(patchJson({ title: "A" }), context());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret_column");
  });
});

describe("DELETE /api/tasks/[id]", () => {
  it.each([
    ["id lạ", "tk_missing"],
    ["của người khác", "tk_other"],
  ])("trả 404 khi %s", async (_label, id) => {
    mocks.deleteTask.mockResolvedValue(false);
    const response = await DELETE(deleteRequest(), context(id));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ data: null, error: { message: NOT_FOUND } });
    expect(mocks.deleteTask).toHaveBeenCalledWith("user_1", id);
  });

  it("trả 204 với body rỗng", async () => {
    mocks.deleteTask.mockResolvedValue(true);
    const response = await DELETE(deleteRequest(), context());
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(mocks.deleteTask).toHaveBeenCalledWith("user_1", "tk_1");
  });

  it("trả 500 thông báo chung khi DB lỗi, không lộ message", async () => {
    mocks.deleteTask.mockRejectedValue(new Error("Foreign key secret_fk"));
    const response = await DELETE(deleteRequest(), context());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret_fk");
  });
});
