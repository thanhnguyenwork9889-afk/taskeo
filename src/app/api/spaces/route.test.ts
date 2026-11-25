import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Space } from "@/domain/types";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(async () => undefined),
  getApiUserId: vi.fn(),
  listSpaces: vi.fn(),
  createSpace: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("@/server/auth/session", () => ({ getApiUserId: mocks.getApiUserId }));
vi.mock("@/server/spaces", () => ({
  MAX_SPACES: 200,
  listSpaces: mocks.listSpaces,
  createSpace: mocks.createSpace,
}));

import { GET, POST } from "./route";

const SPACE: Space = {
  id: "sp_1",
  name: "Công việc",
  description: "",
  color: "#8B73D5",
  tint: "#F0ECFA",
  icon: "briefcase",
  driveFolderId: null,
};

function postRequest(body: string): Request {
  return new Request("http://localhost/api/spaces", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

function postJson(value: unknown): Request {
  return postRequest(JSON.stringify(value));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.getApiUserId.mockResolvedValue({ ok: true, userId: "user_1" });
});

describe("GET /api/spaces", () => {
  it("chờ connection() trước khi đọc phiên", async () => {
    mocks.listSpaces.mockResolvedValue([]);
    await GET();
    expect(mocks.connection).toHaveBeenCalledTimes(1);
  });

  it("trả 401 khi chưa đăng nhập", async () => {
    mocks.getApiUserId.mockResolvedValue({ ok: false, status: 401 });
    const response = await GET();
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.data).toBeNull();
    expect(typeof body.error.message).toBe("string");
    expect(mocks.listSpaces).not.toHaveBeenCalled();
  });

  it("trả 503 ở chế độ demo / thiếu cấu hình và không truy vấn DB", async () => {
    mocks.getApiUserId.mockResolvedValue({ ok: false, status: 503 });
    const response = await GET();
    expect(response.status).toBe(503);
    expect((await response.json()).data).toBeNull();
    expect(mocks.listSpaces).not.toHaveBeenCalled();
  });

  it("trả 500 khi đọc phiên lỗi (ví dụ DB của Auth.js hỏng)", async () => {
    mocks.getApiUserId.mockRejectedValue(new Error("session table missing"));
    const response = await GET();
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("session table");
  });

  it("trả 200 với danh sách không gian của người dùng", async () => {
    mocks.listSpaces.mockResolvedValue([SPACE]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [SPACE], error: null });
    expect(mocks.listSpaces).toHaveBeenCalledWith("user_1");
  });

  it("trả 500 thông báo chung khi DB lỗi, không lộ message", async () => {
    mocks.listSpaces.mockRejectedValue(new Error("PrismaClientKnownRequestError: secret table"));
    const response = await GET();
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain("Prisma");
    expect(text).not.toContain("secret");
    expect(JSON.parse(text).data).toBeNull();
  });
});

describe("POST /api/spaces", () => {
  it("trả 401 khi chưa đăng nhập", async () => {
    mocks.getApiUserId.mockResolvedValue({ ok: false, status: 401 });
    const response = await POST(postJson({ name: "A" }));
    expect(response.status).toBe(401);
    expect(mocks.createSpace).not.toHaveBeenCalled();
  });

  it("trả 503 ở chế độ demo", async () => {
    mocks.getApiUserId.mockResolvedValue({ ok: false, status: 503 });
    const response = await POST(postJson({ name: "A" }));
    expect(response.status).toBe(503);
    expect(mocks.createSpace).not.toHaveBeenCalled();
  });

  it("trả 400 khi body không phải JSON hợp lệ", async () => {
    const response = await POST(postRequest("{ name: "));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({ data: null, error: { message: "Dữ liệu gửi lên không phải JSON hợp lệ" } });
    expect(mocks.createSpace).not.toHaveBeenCalled();
  });

  it.each([
    ["tên rỗng", { name: "   " }, "name"],
    ["màu lạ", { name: "A", color: "#000000" }, "color"],
    ["icon lạ", { name: "A", icon: "rocket" }, "icon"],
  ])("trả 400 khi %s", async (_label, input, field) => {
    const response = await POST(postJson(input));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.data).toBeNull();
    expect(body.error.details.fieldErrors[field]).toBeDefined();
    expect(mocks.createSpace).not.toHaveBeenCalled();
  });

  it("trả 400 khi gửi key thừa userId (chặn mass assignment)", async () => {
    const response = await POST(postJson({ name: "A", userId: "user_2" }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.details.formErrors.length).toBeGreaterThan(0);
    expect(mocks.createSpace).not.toHaveBeenCalled();
  });

  it("trả 400 khi body là mảng thay vì object", async () => {
    const response = await POST(postJson([{ name: "A" }]));
    expect(response.status).toBe(400);
    expect(mocks.createSpace).not.toHaveBeenCalled();
  });

  it("trả 201 với không gian mới có id, color, icon, tint", async () => {
    mocks.createSpace.mockResolvedValue({ ok: true, space: SPACE });
    const response = await POST(postJson({ name: "  Công việc  ", icon: "briefcase" }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.error).toBeNull();
    expect(body.data).toMatchObject({ id: "sp_1", color: "#8B73D5", icon: "briefcase", tint: "#F0ECFA" });
    expect(mocks.createSpace).toHaveBeenCalledWith("user_1", { name: "Công việc", icon: "briefcase" });
  });

  it("trả 409 khi đã đạt giới hạn số không gian", async () => {
    mocks.createSpace.mockResolvedValue({ ok: false, reason: "limit" });
    const response = await POST(postJson({ name: "A" }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ data: null, error: { message: "Đã đạt giới hạn 200 không gian" } });
  });

  it("trả 500 thông báo chung khi DB lỗi, không lộ message", async () => {
    mocks.createSpace.mockRejectedValue(new Error("Unique constraint failed on secret_column"));
    const response = await POST(postJson({ name: "A" }));
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain("secret_column");
    expect(console.error).toHaveBeenCalled();
  });
});
