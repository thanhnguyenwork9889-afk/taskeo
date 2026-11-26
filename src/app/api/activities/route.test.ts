import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Activity } from "@/domain/types";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(async () => undefined),
  getApiUserId: vi.fn(),
  listActivities: vi.fn(),
  serverModuleLoaded: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("@/server/auth/session", () => ({ getApiUserId: mocks.getApiUserId }));
// Factory đặt tên để `freshRoute` đăng ký lại bằng `vi.doMock` (xoá kết quả mock đã cache).
const serverActivitiesModule = vi.hoisted(() => () => {
  mocks.serverModuleLoaded();
  return { listActivities: mocks.listActivities };
});

vi.mock("@/server/activities", serverActivitiesModule);

import { GET } from "./route";

const ACTIVITY: Activity = {
  id: "ac_1",
  type: "task_done",
  entityId: "tk_1",
  message: "Hoàn thành công việc",
  createdAt: "2026-11-26T08:00:00.000Z",
};

const URL_BASE = "http://localhost/api/activities";

function getRequest(query = ""): Request {
  return new Request(`${URL_BASE}${query}`);
}

/**
 * Nạp lại route với module cache sạch: factory `vi.mock("@/server/activities")` chạy lại nếu
 * route import `@/server/activities`, nên `serverModuleLoaded` phản ánh đúng lần gọi này.
 */
async function freshRoute(): Promise<typeof import("./route")> {
  vi.resetModules();
  vi.doMock("@/server/activities", serverActivitiesModule);
  return import("./route");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.getApiUserId.mockResolvedValue({ ok: true, userId: "user_1" });
  mocks.listActivities.mockResolvedValue([]);
});

describe("GET /api/activities — phiên", () => {
  it("chờ connection() trước khi đọc phiên", async () => {
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
    expect(mocks.listActivities).not.toHaveBeenCalled();
  });

  it("trả 503 ở chế độ demo và không import @/server/activities", async () => {
    mocks.getApiUserId.mockResolvedValue({ ok: false, status: 503 });
    const { GET: freshGet } = await freshRoute();
    const response = await freshGet(getRequest());
    expect(response.status).toBe(503);
    expect((await response.json()).data).toBeNull();
    expect(mocks.serverModuleLoaded).not.toHaveBeenCalled();
    expect(mocks.listActivities).not.toHaveBeenCalled();
  });
});

describe("GET /api/activities — query", () => {
  it.each(["0", "201", "1.5", "-1", "abc", "1e2"])("trả 400 khi limit=%s", async (limit) => {
    const response = await GET(getRequest(`?limit=${limit}`));
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.data).toBeNull();
    expect(json.error.details.fieldErrors.limit).toBeDefined();
    expect(mocks.listActivities).not.toHaveBeenCalled();
  });

  it("trả 400 nêu key khi limit bị gửi lặp", async () => {
    const response = await GET(getRequest("?limit=10&limit=20"));
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.data).toBeNull();
    expect(json.error.message).toContain("limit");
    expect(mocks.listActivities).not.toHaveBeenCalled();
  });

  it("dùng limit mặc định 50 khi không gửi", async () => {
    const response = await GET(getRequest());
    expect(response.status).toBe(200);
    expect(mocks.listActivities).toHaveBeenCalledWith("user_1", 50);
  });

  it("coi ?limit= rỗng như không gửi", async () => {
    await GET(getRequest("?limit="));
    expect(mocks.listActivities).toHaveBeenCalledWith("user_1", 50);
  });

  it("nhận limit=200 (tối đa)", async () => {
    const response = await GET(getRequest("?limit=200"));
    expect(response.status).toBe(200);
    expect(mocks.listActivities).toHaveBeenCalledWith("user_1", 200);
  });

  it("bỏ qua key lạ trong query", async () => {
    const response = await GET(getRequest("?limit=5&userId=user_2&foo=a&foo=b"));
    expect(response.status).toBe(200);
    expect(mocks.listActivities).toHaveBeenCalledWith("user_1", 5);
  });
});

describe("GET /api/activities — kết quả", () => {
  it("trả 200 { data: Activity[], error: null } đủ 5 trường", async () => {
    mocks.listActivities.mockResolvedValue([ACTIVITY]);
    const response = await GET(getRequest());
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ data: [ACTIVITY], error: null });
    expect(Object.keys(json.data[0]).sort()).toEqual(["createdAt", "entityId", "id", "message", "type"]);
  });

  it("trả 500 thông báo chung khi DB lỗi, không lộ message", async () => {
    mocks.listActivities.mockRejectedValue(new Error("PrismaClientKnownRequestError: secret table"));
    const response = await GET(getRequest());
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain("Prisma");
    expect(text).not.toContain("secret");
    expect(JSON.parse(text).data).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });
});
