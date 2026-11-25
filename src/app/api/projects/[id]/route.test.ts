import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/domain/types";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(async () => undefined),
  getApiUserId: vi.fn(),
  getProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("@/server/auth/session", () => ({ getApiUserId: mocks.getApiUserId }));
vi.mock("@/server/projects", () => ({
  getProject: mocks.getProject,
  updateProject: mocks.updateProject,
  deleteProject: mocks.deleteProject,
}));

import { DELETE, GET, PATCH } from "./route";

const PROJECT: Project = {
  id: "pr_1",
  spaceId: "sp_1",
  name: "Ra mắt",
  description: "",
  status: "ACTIVE",
  dueDate: "2026-12-31",
};

const PROJECT_URL = "http://localhost/api/projects/pr_1";
const NOT_FOUND = "Không tìm thấy dự án";
const CONFLICT = "Tên dự án đã tồn tại trong không gian này";

function context(id = "pr_1") {
  return { params: Promise.resolve({ id }) };
}

function getRequest(): Request {
  return new Request(PROJECT_URL);
}

function patchRequest(body: string): Request {
  return new Request(PROJECT_URL, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body,
  });
}

function patchJson(value: unknown): Request {
  return patchRequest(JSON.stringify(value));
}

function deleteRequest(): Request {
  return new Request(PROJECT_URL, { method: "DELETE" });
}

function expectNoServerCall(): void {
  expect(mocks.getProject).not.toHaveBeenCalled();
  expect(mocks.updateProject).not.toHaveBeenCalled();
  expect(mocks.deleteProject).not.toHaveBeenCalled();
}

const CALLS = [
  ["GET", (id: string) => GET(getRequest(), context(id))],
  ["PATCH", (id: string) => PATCH(patchJson({ name: "A" }), context(id))],
  ["DELETE", (id: string) => DELETE(deleteRequest(), context(id))],
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.getApiUserId.mockResolvedValue({ ok: true, userId: "user_1" });
});

describe.each(CALLS)("%s /api/projects/[id] — phiên và id", (_method, call) => {
  it("trả 401 khi chưa đăng nhập và không gọi hàm server", async () => {
    mocks.getApiUserId.mockResolvedValue({ ok: false, status: 401 });
    const response = await call("pr_1");
    expect(response.status).toBe(401);
    expect((await response.json()).data).toBeNull();
    expectNoServerCall();
  });

  it("trả 503 ở chế độ demo và không gọi hàm server", async () => {
    mocks.getApiUserId.mockResolvedValue({ ok: false, status: 503 });
    const response = await call("pr_1");
    expect(response.status).toBe(503);
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

describe("GET /api/projects/[id]", () => {
  it("chờ connection() trước khi đọc phiên", async () => {
    mocks.getProject.mockResolvedValue(PROJECT);
    await GET(getRequest(), context());
    expect(mocks.connection).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["id lạ", "pr_missing"],
    ["của người khác", "pr_other"],
  ])("trả 404 khi %s", async (_label, id) => {
    mocks.getProject.mockResolvedValue(null);
    const response = await GET(getRequest(), context(id));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ data: null, error: { message: NOT_FOUND } });
    expect(mocks.getProject).toHaveBeenCalledWith("user_1", id);
  });

  it("trả 200 với dự án", async () => {
    mocks.getProject.mockResolvedValue(PROJECT);
    const response = await GET(getRequest(), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: PROJECT, error: null });
    expect(mocks.getProject).toHaveBeenCalledWith("user_1", "pr_1");
  });

  it("trả 500 thông báo chung khi DB lỗi, không lộ message", async () => {
    mocks.getProject.mockRejectedValue(new Error("PrismaClientKnownRequestError: secret table"));
    const response = await GET(getRequest(), context());
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain("Prisma");
    expect(text).not.toContain("secret");
    expect(console.error).toHaveBeenCalled();
  });
});

describe("PATCH /api/projects/[id]", () => {
  it("trả 400 khi body không phải JSON hợp lệ", async () => {
    const response = await PATCH(patchRequest("{ name: "), context());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      data: null,
      error: { message: "Dữ liệu gửi lên không phải JSON hợp lệ" },
    });
    expect(mocks.updateProject).not.toHaveBeenCalled();
  });

  it("trả 400 khi body rỗng {}", async () => {
    const response = await PATCH(patchJson({}), context());
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.data).toBeNull();
    expect(body.error.details.formErrors.length).toBeGreaterThan(0);
    expect(mocks.updateProject).not.toHaveBeenCalled();
  });

  it.each([
    ["spaceId", { name: "A", spaceId: "sp_2" }],
    ["userId", { name: "A", userId: "user_2" }],
  ])("trả 400 khi gửi key thừa %s (chặn mass assignment)", async (_key, payload) => {
    const response = await PATCH(patchJson(payload), context());
    expect(response.status).toBe(400);
    expect((await response.json()).error.details.formErrors.length).toBeGreaterThan(0);
    expect(mocks.updateProject).not.toHaveBeenCalled();
  });

  it("trả 400 khi dueDate là ngày không có thật", async () => {
    const response = await PATCH(patchJson({ dueDate: "2026-02-31" }), context());
    expect(response.status).toBe(400);
    expect((await response.json()).error.details.fieldErrors.dueDate).toBeDefined();
    expect(mocks.updateProject).not.toHaveBeenCalled();
  });

  it("trả 404 khi không có hoặc thuộc người khác", async () => {
    mocks.updateProject.mockResolvedValue({ ok: false, reason: "not_found" });
    const response = await PATCH(patchJson({ name: "A" }), context("pr_other"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ data: null, error: { message: NOT_FOUND } });
    expect(mocks.updateProject).toHaveBeenCalledWith("user_1", "pr_other", { name: "A" });
  });

  it("trả 409 khi đổi tên trùng trong không gian", async () => {
    mocks.updateProject.mockResolvedValue({ ok: false, reason: "conflict" });
    const response = await PATCH(patchJson({ name: "Trùng" }), context());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ data: null, error: { message: CONFLICT } });
  });

  it("trả 200 và chỉ truyền các trường gửi lên (đã parse)", async () => {
    const updated: Project = { ...PROJECT, name: "Mới", dueDate: null };
    mocks.updateProject.mockResolvedValue({ ok: true, project: updated });
    const response = await PATCH(patchJson({ name: "  Mới  ", dueDate: null }), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: updated, error: null });
    expect(mocks.updateProject).toHaveBeenCalledWith("user_1", "pr_1", { name: "Mới", dueDate: null });
  });

  it("trả 500 thông báo chung khi DB lỗi, không lộ message", async () => {
    mocks.updateProject.mockRejectedValue(new Error("Unique constraint failed on secret_column"));
    const response = await PATCH(patchJson({ name: "A" }), context());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret_column");
  });
});

describe("DELETE /api/projects/[id]", () => {
  it("trả 404 khi không có hoặc thuộc người khác", async () => {
    mocks.deleteProject.mockResolvedValue(false);
    const response = await DELETE(deleteRequest(), context("pr_other"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ data: null, error: { message: NOT_FOUND } });
    expect(mocks.deleteProject).toHaveBeenCalledWith("user_1", "pr_other");
  });

  it("trả 204 với body rỗng", async () => {
    mocks.deleteProject.mockResolvedValue(true);
    const response = await DELETE(deleteRequest(), context());
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(mocks.deleteProject).toHaveBeenCalledWith("user_1", "pr_1");
  });

  it("trả 500 thông báo chung khi DB lỗi, không lộ message", async () => {
    mocks.deleteProject.mockRejectedValue(new Error("Foreign key secret_fk"));
    const response = await DELETE(deleteRequest(), context());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret_fk");
  });
});
