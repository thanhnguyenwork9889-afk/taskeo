import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@/domain/types";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(async () => undefined),
  getApiUserId: vi.fn(),
  listTasks: vi.fn(),
  createTask: vi.fn(),
  serverModuleLoaded: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("@/server/auth/session", () => ({ getApiUserId: mocks.getApiUserId }));
// Factory đặt tên để `freshRoute` đăng ký lại bằng `vi.doMock` (xoá kết quả mock đã cache).
const serverTasksModule = vi.hoisted(() => () => {
  mocks.serverModuleLoaded();
  return {
    listTasks: mocks.listTasks,
    createTask: mocks.createTask,
    MAX_TASKS_PER_USER: 2000,
  };
});

vi.mock("@/server/tasks", serverTasksModule);

import { GET, POST } from "./route";

const TASK: Task = {
  id: "tk_1",
  spaceId: "sp_1",
  projectId: "pj_1",
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

const URL_BASE = "http://localhost/api/tasks";

function getRequest(query = ""): Request {
  return new Request(`${URL_BASE}${query}`);
}

function postRequest(body: string): Request {
  return new Request(URL_BASE, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

function postJson(value: unknown): Request {
  return postRequest(JSON.stringify(value));
}

/**
 * Nạp lại route với module cache sạch: factory `vi.mock("@/server/tasks")` chạy lại nếu route
 * (tĩnh hoặc động) import `@/server/tasks`, nên `serverModuleLoaded` phản ánh đúng lần gọi này.
 */
async function freshRoute(): Promise<typeof import("./route")> {
  // resetModules không xoá kết quả mock đã cache ("mock:*"); doMock đăng ký lại và xoá cache đó.
  vi.resetModules();
  vi.doMock("@/server/tasks", serverTasksModule);
  return import("./route");
}

function expectNoServerCall(): void {
  expect(mocks.listTasks).not.toHaveBeenCalled();
  expect(mocks.createTask).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.getApiUserId.mockResolvedValue({ ok: true, userId: "user_1" });
});

describe("GET /api/tasks — phiên", () => {
  it("chờ connection() trước khi đọc phiên", async () => {
    mocks.listTasks.mockResolvedValue([]);
    await GET(getRequest());
    expect(mocks.connection).toHaveBeenCalledTimes(1);
  });

  it("trả 401 khi chưa đăng nhập, không import và không gọi hàm server", async () => {
    mocks.getApiUserId.mockResolvedValue({ ok: false, status: 401 });
    const { GET: freshGet } = await freshRoute();
    const response = await freshGet(getRequest());
    expect(response.status).toBe(401);
    expect((await response.json()).data).toBeNull();
    expect(mocks.serverModuleLoaded).not.toHaveBeenCalled();
    expectNoServerCall();
  });

  it("trả 503 ở chế độ demo và không import @/server/tasks", async () => {
    mocks.getApiUserId.mockResolvedValue({ ok: false, status: 503 });
    const { GET: freshGet } = await freshRoute();
    const response = await freshGet(getRequest());
    expect(response.status).toBe(503);
    expect(mocks.serverModuleLoaded).not.toHaveBeenCalled();
    expectNoServerCall();
  });
});

describe("GET /api/tasks — query", () => {
  it("trả 400 khi status lạ", async () => {
    const response = await GET(getRequest("?status=FOO"));
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.data).toBeNull();
    expect(json.error.details.fieldErrors.status).toBeDefined();
    expectNoServerCall();
  });

  it("trả 400 nêu key khi status bị lặp", async () => {
    const response = await GET(getRequest("?status=TODO&status=DONE"));
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.data).toBeNull();
    expect(json.error.message).toContain("status");
    expectNoServerCall();
  });

  it("trả 400 khi id trong query dài 65 ký tự", async () => {
    const response = await GET(getRequest(`?spaceId=${"a".repeat(65)}`));
    expect(response.status).toBe(400);
    expect((await response.json()).error.details.fieldErrors.spaceId).toBeDefined();
    expectNoServerCall();
  });

  it("coi ?spaceId= rỗng như không gửi", async () => {
    mocks.listTasks.mockResolvedValue([]);
    const response = await GET(getRequest("?spaceId="));
    expect(response.status).toBe(200);
    const [, filter] = mocks.listTasks.mock.calls[0];
    expect(filter.spaceId).toBeUndefined();
  });

  it("bỏ qua key lạ trong query", async () => {
    mocks.listTasks.mockResolvedValue([]);
    const response = await GET(getRequest("?_t=123&foo=a&foo=b"));
    expect(response.status).toBe(200);
    const [, filter] = mocks.listTasks.mock.calls[0];
    expect(filter).not.toHaveProperty("_t");
    expect(filter).not.toHaveProperty("foo");
  });

  it("trả 200 và truyền đúng filter cho listTasks", async () => {
    mocks.listTasks.mockResolvedValue([TASK]);
    const response = await GET(getRequest("?spaceId=sp_1&projectId=pj_1&status=IN_PROGRESS"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [TASK], error: null });
    expect(mocks.listTasks).toHaveBeenCalledWith("user_1", {
      spaceId: "sp_1",
      projectId: "pj_1",
      status: "IN_PROGRESS",
    });
  });

  it("trả 500 thông báo chung khi DB lỗi, không lộ message", async () => {
    mocks.listTasks.mockRejectedValue(new Error("PrismaClientKnownRequestError: secret table"));
    const response = await GET(getRequest());
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain("Prisma");
    expect(text).not.toContain("secret");
    expect(console.error).toHaveBeenCalled();
  });
});

describe("POST /api/tasks — phiên", () => {
  it("trả 401 khi chưa đăng nhập, không đọc body, không import và không gọi hàm server", async () => {
    mocks.getApiUserId.mockResolvedValue({ ok: false, status: 401 });
    const { POST: freshPost } = await freshRoute();
    const request = postJson({ title: "A" });
    const response = await freshPost(request);
    expect(response.status).toBe(401);
    expect(request.bodyUsed).toBe(false);
    expect(mocks.serverModuleLoaded).not.toHaveBeenCalled();
    expectNoServerCall();
  });

  it("trả 503 ở chế độ demo, không đọc body và không import @/server/tasks", async () => {
    mocks.getApiUserId.mockResolvedValue({ ok: false, status: 503 });
    const { POST: freshPost } = await freshRoute();
    const request = postJson({ title: "A" });
    const response = await freshPost(request);
    expect(response.status).toBe(503);
    expect(request.bodyUsed).toBe(false);
    expect(mocks.serverModuleLoaded).not.toHaveBeenCalled();
    expectNoServerCall();
  });
});

describe("POST /api/tasks — validate", () => {
  it("trả 400 khi body không phải JSON hợp lệ", async () => {
    const response = await POST(postRequest("{ title: "));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      data: null,
      error: { message: "Dữ liệu gửi lên không phải JSON hợp lệ" },
    });
    expect(mocks.createTask).not.toHaveBeenCalled();
  });

  it.each([
    ["tiêu đề rỗng", { title: "   " }, "title"],
    ["tiêu đề 201 ký tự", { title: "a".repeat(201) }, "title"],
    ["status lạ", { title: "A", status: "FINISHED" }, "status"],
    ["priority lạ", { title: "A", priority: "CRITICAL" }, "priority"],
    ["dueDate không có thật", { title: "A", dueDate: "2026-02-31" }, "dueDate"],
  ])("trả 400 khi %s", async (_label, body, field) => {
    const response = await POST(postJson(body));
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.data).toBeNull();
    expect(json.error.details.fieldErrors[field]).toBeDefined();
    expect(mocks.createTask).not.toHaveBeenCalled();
  });

  it.each([
    ["userId", { title: "A", userId: "user_2" }],
    ["order", { title: "A", order: 5 }],
    ["completedAt", { title: "A", completedAt: "2026-01-01T00:00:00.000Z" }],
  ])("trả 400 khi gửi key thừa %s (chặn mass assignment)", async (_label, body) => {
    const response = await POST(postJson(body));
    expect(response.status).toBe(400);
    expect((await response.json()).error.details.formErrors.length).toBeGreaterThan(0);
    expect(mocks.createTask).not.toHaveBeenCalled();
  });
});

describe("POST /api/tasks — kết quả server", () => {
  it.each([
    ["invalid_project", "Không tìm thấy dự án"],
    ["invalid_space", "Không tìm thấy không gian"],
    ["space_mismatch", "Không gian không khớp với dự án"],
  ])("trả 400 khi %s", async (reason, message) => {
    mocks.createTask.mockResolvedValue({ ok: false, reason });
    const response = await POST(postJson({ title: "A", projectId: "pj_x", spaceId: "sp_x" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ data: null, error: { message } });
    expect(mocks.createTask).toHaveBeenCalledWith("user_1", {
      title: "A",
      projectId: "pj_x",
      spaceId: "sp_x",
    });
  });

  it("trả 409 nêu giới hạn khi người dùng đã đủ công việc", async () => {
    mocks.createTask.mockResolvedValue({ ok: false, reason: "limit" });
    const response = await POST(postJson({ title: "A" }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      data: null,
      error: { message: "Đã đạt giới hạn 2000 công việc" },
    });
  });

  it("trả 201 với công việc mới đủ trường Task và chỉ truyền trường đã validate", async () => {
    mocks.createTask.mockResolvedValue({ ok: true, task: TASK });
    const response = await POST(
      postJson({ title: "  Viết báo cáo  ", projectId: "pj_1", dueDate: "2026-12-31" }),
    );
    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json).toEqual({ data: TASK, error: null });
    expect(Object.keys(json.data).sort()).toEqual(
      [
        "addToCalendar",
        "completedAt",
        "createdAt",
        "description",
        "dueDate",
        "id",
        "linkedFileIds",
        "priority",
        "projectId",
        "spaceId",
        "status",
        "title",
        "updatedAt",
      ],
    );
    expect(mocks.createTask).toHaveBeenCalledWith("user_1", {
      title: "Viết báo cáo",
      projectId: "pj_1",
      dueDate: "2026-12-31",
    });
  });

  it("trả 500 thông báo chung khi DB lỗi, không lộ message", async () => {
    mocks.createTask.mockRejectedValue(new Error("Foreign key constraint failed on secret_column"));
    const response = await POST(postJson({ title: "A" }));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret_column");
    expect(console.error).toHaveBeenCalled();
  });
});
