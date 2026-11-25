import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Space } from "@/domain/types";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(async () => undefined),
  getApiUserId: vi.fn(),
  getSpace: vi.fn(),
  updateSpace: vi.fn(),
  deleteSpace: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("@/server/auth/session", () => ({ getApiUserId: mocks.getApiUserId }));
vi.mock("@/server/spaces", () => ({
  getSpace: mocks.getSpace,
  updateSpace: mocks.updateSpace,
  deleteSpace: mocks.deleteSpace,
}));

import { DELETE, GET, PATCH } from "./route";

const SPACE: Space = {
  id: "sp_1",
  name: "Công việc",
  description: "",
  color: "#8B73D5",
  tint: "#F0ECFA",
  icon: "briefcase",
  driveFolderId: null,
};

const SPACE_URL = "http://localhost/api/spaces/sp_1";
const NOT_FOUND = "Không tìm thấy không gian";

function context(id = "sp_1") {
  return { params: Promise.resolve({ id }) };
}

function getRequest(): Request {
  return new Request(SPACE_URL);
}

function patchRequest(body: string): Request {
  return new Request(SPACE_URL, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body,
  });
}

function patchJson(value: unknown): Request {
  return patchRequest(JSON.stringify(value));
}

function deleteRequest(): Request {
  return new Request(SPACE_URL, { method: "DELETE" });
}

function expectNoServerCall(): void {
  expect(mocks.getSpace).not.toHaveBeenCalled();
  expect(mocks.updateSpace).not.toHaveBeenCalled();
  expect(mocks.deleteSpace).not.toHaveBeenCalled();
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

describe.each(CALLS)("%s /api/spaces/[id] — phiên và id", (_method, call) => {
  it("trả 401 khi chưa đăng nhập và không gọi hàm server", async () => {
    mocks.getApiUserId.mockResolvedValue({ ok: false, status: 401 });
    const response = await call("sp_1");
    expect(response.status).toBe(401);
    expect((await response.json()).data).toBeNull();
    expectNoServerCall();
  });

  it("trả 503 ở chế độ demo và không gọi hàm server", async () => {
    mocks.getApiUserId.mockResolvedValue({ ok: false, status: 503 });
    const response = await call("sp_1");
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

describe("GET /api/spaces/[id]", () => {
  it("chờ connection() trước khi đọc phiên", async () => {
    mocks.getSpace.mockResolvedValue(SPACE);
    await GET(getRequest(), context());
    expect(mocks.connection).toHaveBeenCalledTimes(1);
  });

  it("trả 404 khi không có hoặc thuộc người khác", async () => {
    mocks.getSpace.mockResolvedValue(null);
    const response = await GET(getRequest(), context("sp_other"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ data: null, error: { message: NOT_FOUND } });
    expect(mocks.getSpace).toHaveBeenCalledWith("user_1", "sp_other");
  });

  it("trả 200 với không gian", async () => {
    mocks.getSpace.mockResolvedValue(SPACE);
    const response = await GET(getRequest(), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: SPACE, error: null });
    expect(mocks.getSpace).toHaveBeenCalledWith("user_1", "sp_1");
  });

  it("trả 500 thông báo chung khi DB lỗi, không lộ message", async () => {
    mocks.getSpace.mockRejectedValue(new Error("PrismaClientKnownRequestError: secret table"));
    const response = await GET(getRequest(), context());
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain("Prisma");
    expect(text).not.toContain("secret");
    expect(console.error).toHaveBeenCalled();
  });
});

describe("PATCH /api/spaces/[id]", () => {
  it("trả 400 khi body không phải JSON hợp lệ", async () => {
    const response = await PATCH(patchRequest("{ name: "), context());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      data: null,
      error: { message: "Dữ liệu gửi lên không phải JSON hợp lệ" },
    });
    expect(mocks.updateSpace).not.toHaveBeenCalled();
  });

  it("trả 400 khi body rỗng {}", async () => {
    const response = await PATCH(patchJson({}), context());
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.data).toBeNull();
    expect(body.error.details.formErrors.length).toBeGreaterThan(0);
    expect(mocks.updateSpace).not.toHaveBeenCalled();
  });

  it("trả 400 khi gửi key thừa userId (chặn mass assignment)", async () => {
    const response = await PATCH(patchJson({ name: "A", userId: "user_2" }), context());
    expect(response.status).toBe(400);
    expect((await response.json()).error.details.formErrors.length).toBeGreaterThan(0);
    expect(mocks.updateSpace).not.toHaveBeenCalled();
  });

  it("trả 400 khi màu lạ", async () => {
    const response = await PATCH(patchJson({ color: "#000000" }), context());
    expect(response.status).toBe(400);
    expect((await response.json()).error.details.fieldErrors.color).toBeDefined();
    expect(mocks.updateSpace).not.toHaveBeenCalled();
  });

  it("trả 404 khi không có hoặc thuộc người khác", async () => {
    mocks.updateSpace.mockResolvedValue(null);
    const response = await PATCH(patchJson({ name: "A" }), context("sp_other"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ data: null, error: { message: NOT_FOUND } });
    expect(mocks.updateSpace).toHaveBeenCalledWith("user_1", "sp_other", { name: "A" });
  });

  it("trả 200 và chỉ truyền các trường gửi lên", async () => {
    const updated: Space = { ...SPACE, name: "Mới", icon: "book" };
    mocks.updateSpace.mockResolvedValue(updated);
    const response = await PATCH(patchJson({ name: "  Mới  ", icon: "book" }), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: updated, error: null });
    expect(mocks.updateSpace).toHaveBeenCalledWith("user_1", "sp_1", { name: "Mới", icon: "book" });
  });

  it("trả 500 thông báo chung khi DB lỗi, không lộ message", async () => {
    mocks.updateSpace.mockRejectedValue(new Error("Unique constraint failed on secret_column"));
    const response = await PATCH(patchJson({ name: "A" }), context());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret_column");
  });
});

describe("DELETE /api/spaces/[id]", () => {
  it("trả 404 khi không có hoặc thuộc người khác", async () => {
    mocks.deleteSpace.mockResolvedValue(false);
    const response = await DELETE(deleteRequest(), context("sp_other"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ data: null, error: { message: NOT_FOUND } });
    expect(mocks.deleteSpace).toHaveBeenCalledWith("user_1", "sp_other");
  });

  it("trả 204 với body rỗng", async () => {
    mocks.deleteSpace.mockResolvedValue(true);
    const response = await DELETE(deleteRequest(), context());
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(mocks.deleteSpace).toHaveBeenCalledWith("user_1", "sp_1");
  });

  it("trả 500 thông báo chung khi DB lỗi, không lộ message", async () => {
    mocks.deleteSpace.mockRejectedValue(new Error("Foreign key secret_fk"));
    const response = await DELETE(deleteRequest(), context());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret_fk");
  });
});
