import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/domain/types";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(async () => undefined),
  getApiUserId: vi.fn(),
  listProjects: vi.fn(),
  createProject: vi.fn(),
  serverModuleLoaded: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("@/server/auth/session", () => ({ getApiUserId: mocks.getApiUserId }));
vi.mock("@/server/projects", () => {
  mocks.serverModuleLoaded();
  return {
    listProjects: mocks.listProjects,
    createProject: mocks.createProject,
    MAX_PROJECTS_PER_SPACE: 200,
  };
});

import { GET, POST } from "./route";

const PROJECT: Project = {
  id: "pj_1",
  spaceId: "sp_1",
  name: "Ra mắt",
  description: "",
  status: "ACTIVE",
  dueDate: "2026-12-31",
};

const URL_BASE = "http://localhost/api/spaces/sp_1/projects";
const NOT_FOUND = "Không tìm thấy không gian";

function context(id = "sp_1") {
  return { params: Promise.resolve({ id }) };
}

function getRequest(): Request {
  return new Request(URL_BASE);
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

function expectNoServerCall(): void {
  expect(mocks.listProjects).not.toHaveBeenCalled();
  expect(mocks.createProject).not.toHaveBeenCalled();
}

const CALLS = [
  ["GET", (id: string) => GET(getRequest(), context(id))],
  ["POST", (id: string) => POST(postJson({ name: "A" }), context(id))],
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.getApiUserId.mockResolvedValue({ ok: true, userId: "user_1" });
});

describe.each(CALLS)("%s /api/spaces/[id]/projects — phiên và id", (_method, call) => {
  it("trả 401 khi chưa đăng nhập và không gọi hàm server", async () => {
    mocks.getApiUserId.mockResolvedValue({ ok: false, status: 401 });
    const response = await call("sp_1");
    expect(response.status).toBe(401);
    expect((await response.json()).data).toBeNull();
    expectNoServerCall();
  });

  it("trả 503 ở chế độ demo và không import @/server/projects", async () => {
    mocks.getApiUserId.mockResolvedValue({ ok: false, status: 503 });
    const response = await call("sp_1");
    expect(response.status).toBe(503);
    expect(mocks.serverModuleLoaded).not.toHaveBeenCalled();
    expectNoServerCall();
  });

  it.each([
    ["quá 64 ký tự", "a".repeat(65)],
    ["rỗng", ""],
  ])("trả 404 khi id %s và không gọi hàm server", async (_label, id) => {
    const response = await call(id);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ data: null, error: { message: NOT_FOUND } });
    expectNoServerCall();
  });
});

describe("GET /api/spaces/[id]/projects", () => {
  it("chờ connection() trước khi đọc phiên", async () => {
    mocks.listProjects.mockResolvedValue([]);
    await GET(getRequest(), context());
    expect(mocks.connection).toHaveBeenCalledTimes(1);
  });

  it("trả 404 khi không gian không có hoặc thuộc người khác", async () => {
    mocks.listProjects.mockResolvedValue(null);
    const response = await GET(getRequest(), context("sp_other"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ data: null, error: { message: NOT_FOUND } });
    expect(mocks.listProjects).toHaveBeenCalledWith("user_1", "sp_other");
  });

  it("trả 200 với danh sách dự án", async () => {
    mocks.listProjects.mockResolvedValue([PROJECT]);
    const response = await GET(getRequest(), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [PROJECT], error: null });
    expect(mocks.listProjects).toHaveBeenCalledWith("user_1", "sp_1");
  });

  it("trả 500 thông báo chung khi DB lỗi, không lộ message", async () => {
    mocks.listProjects.mockRejectedValue(new Error("PrismaClientKnownRequestError: secret table"));
    const response = await GET(getRequest(), context());
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain("Prisma");
    expect(text).not.toContain("secret");
    expect(console.error).toHaveBeenCalled();
  });
});

describe("POST /api/spaces/[id]/projects", () => {
  it("trả 400 khi body không phải JSON hợp lệ", async () => {
    const response = await POST(postRequest("{ name: "), context());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      data: null,
      error: { message: "Dữ liệu gửi lên không phải JSON hợp lệ" },
    });
    expect(mocks.createProject).not.toHaveBeenCalled();
  });

  it.each([
    ["tên rỗng", { name: "   " }, "name"],
    ["status lạ", { name: "A", status: "FINISHED" }, "status"],
    ["dueDate không có thật", { name: "A", dueDate: "2026-02-31" }, "dueDate"],
    ["dueDate sai định dạng", { name: "A", dueDate: "31/12/2026" }, "dueDate"],
  ])("trả 400 khi %s", async (_label, body, field) => {
    const response = await POST(postJson(body), context());
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.data).toBeNull();
    expect(json.error.details.fieldErrors[field]).toBeDefined();
    expect(mocks.createProject).not.toHaveBeenCalled();
  });

  it.each([
    ["spaceId", { name: "A", spaceId: "sp_2" }],
    ["userId", { name: "A", userId: "user_2" }],
  ])("trả 400 khi gửi key thừa %s (chặn mass assignment)", async (_label, body) => {
    const response = await POST(postJson(body), context());
    expect(response.status).toBe(400);
    expect((await response.json()).error.details.formErrors.length).toBeGreaterThan(0);
    expect(mocks.createProject).not.toHaveBeenCalled();
  });

  it("trả 404 khi không gian không có hoặc thuộc người khác", async () => {
    mocks.createProject.mockResolvedValue({ ok: false, reason: "not_found" });
    const response = await POST(postJson({ name: "A" }), context("sp_other"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ data: null, error: { message: NOT_FOUND } });
    expect(mocks.createProject).toHaveBeenCalledWith("user_1", "sp_other", { name: "A" });
  });

  it("trả 409 khi tên trùng trong không gian", async () => {
    mocks.createProject.mockResolvedValue({ ok: false, reason: "conflict" });
    const response = await POST(postJson({ name: "A" }), context());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      data: null,
      error: { message: "Tên dự án đã tồn tại trong không gian này" },
    });
  });

  it("trả 409 nêu giới hạn khi không gian đã đủ dự án", async () => {
    mocks.createProject.mockResolvedValue({ ok: false, reason: "limit" });
    const response = await POST(postJson({ name: "A" }), context());
    expect(response.status).toBe(409);
    expect((await response.json()).error.message).toContain("200");
  });

  it("trả 201 với dự án mới và chỉ truyền trường đã validate", async () => {
    mocks.createProject.mockResolvedValue({ ok: true, project: PROJECT });
    const response = await POST(
      postJson({ name: "  Ra mắt  ", status: "ACTIVE", dueDate: "2026-12-31" }),
      context(),
    );
    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json).toEqual({ data: PROJECT, error: null });
    expect(Object.keys(json.data).sort()).toEqual(
      ["description", "dueDate", "id", "name", "spaceId", "status"],
    );
    expect(mocks.createProject).toHaveBeenCalledWith("user_1", "sp_1", {
      name: "Ra mắt",
      status: "ACTIVE",
      dueDate: "2026-12-31",
    });
  });

  it("trả 500 thông báo chung khi DB lỗi, không lộ message", async () => {
    mocks.createProject.mockRejectedValue(new Error("Unique constraint failed on secret_column"));
    const response = await POST(postJson({ name: "A" }), context());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret_column");
    expect(console.error).toHaveBeenCalled();
  });
});
