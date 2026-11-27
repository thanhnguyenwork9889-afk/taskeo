import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(async () => undefined),
  getApiUserId: vi.fn(),
  getPickerAccessToken: vi.fn(),
  serverModuleLoaded: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("@/server/auth/session", () => ({ getApiUserId: mocks.getApiUserId }));
// Factory đặt tên để `freshRoute` đăng ký lại bằng `vi.doMock` (xoá kết quả mock đã cache).
const serverPickerTokenModule = vi.hoisted(() => () => {
  mocks.serverModuleLoaded();
  return { getPickerAccessToken: mocks.getPickerAccessToken };
});

vi.mock("@/server/google/picker-token", serverPickerTokenModule);

import { GET } from "./route";

const TOKEN = "ya29.picker-secret-token";
const EXPIRES_AT = "2026-11-27T10:00:00.000Z";
const DEVELOPER_KEY = "AIza-test-key";
const APP_ID = "123456789012";

async function freshRoute(): Promise<typeof import("./route")> {
  vi.resetModules();
  vi.doMock("@/server/google/picker-token", serverPickerTokenModule);
  return import("./route");
}

function expectNoStore(response: Response): void {
  expect(response.headers.get("Cache-Control")).toBe("no-store");
}

/** Mọi lần gọi console.* trong test, nối thành chuỗi để dò token. */
function consoleOutput(): string {
  const calls = [console.error, console.warn, console.log, console.info].flatMap(
    (fn) => vi.mocked(fn).mock.calls,
  );
  return JSON.stringify(calls);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.stubEnv("GOOGLE_PICKER_API_KEY", DEVELOPER_KEY);
  vi.stubEnv("GOOGLE_CLOUD_PROJECT_NUMBER", APP_ID);
  mocks.getApiUserId.mockResolvedValue({ ok: true, userId: "user_1" });
  mocks.getPickerAccessToken.mockResolvedValue({ status: "ok", accessToken: TOKEN, expiresAt: EXPIRES_AT });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/drive/picker-token — phiên", () => {
  it("chờ connection() trước khi đọc phiên", async () => {
    await GET();
    expect(mocks.connection).toHaveBeenCalledTimes(1);
  });

  it("trả 401 no-store khi chưa đăng nhập, không import và không lấy token", async () => {
    mocks.getApiUserId.mockResolvedValue({ ok: false, status: 401 });
    const { GET: freshGet } = await freshRoute();
    const response = await freshGet();
    expect(response.status).toBe(401);
    expectNoStore(response);
    expect((await response.json()).data).toBeNull();
    expect(mocks.serverModuleLoaded).not.toHaveBeenCalled();
    expect(mocks.getPickerAccessToken).not.toHaveBeenCalled();
  });

  it("trả 503 no-store ở chế độ demo và không import @/server/google/picker-token", async () => {
    mocks.getApiUserId.mockResolvedValue({ ok: false, status: 503 });
    const { GET: freshGet } = await freshRoute();
    const response = await freshGet();
    expect(response.status).toBe(503);
    expectNoStore(response);
    const json = await response.json();
    expect(json.data).toBeNull();
    expect(json.error.code).toBeUndefined();
    expect(mocks.serverModuleLoaded).not.toHaveBeenCalled();
    expect(mocks.getPickerAccessToken).not.toHaveBeenCalled();
  });
});

describe("GET /api/drive/picker-token — cấu hình Picker", () => {
  it.each([
    ["thiếu GOOGLE_PICKER_API_KEY", "GOOGLE_PICKER_API_KEY", ""],
    ["thiếu GOOGLE_CLOUD_PROJECT_NUMBER", "GOOGLE_CLOUD_PROJECT_NUMBER", ""],
    ["GOOGLE_CLOUD_PROJECT_NUMBER không phải chữ số", "GOOGLE_CLOUD_PROJECT_NUMBER", "my-project"],
  ])("trả 503 picker_not_configured khi %s, không import và không lấy token", async (_label, key, value) => {
    vi.stubEnv(key, value);
    const { GET: freshGet } = await freshRoute();
    const response = await freshGet();
    expect(response.status).toBe(503);
    expectNoStore(response);
    const json = await response.json();
    expect(json.data).toBeNull();
    expect(json.error.code).toBe("picker_not_configured");
    expect(json.error.message).toBe("Máy chủ chưa cấu hình Google Picker");
    expect(mocks.serverModuleLoaded).not.toHaveBeenCalled();
    expect(mocks.getPickerAccessToken).not.toHaveBeenCalled();
  });
});

describe("GET /api/drive/picker-token — kết quả", () => {
  it("trả 200 { data: { accessToken, expiresAt, developerKey, appId }, error: null } no-store", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expectNoStore(response);
    expect(await response.json()).toEqual({
      data: { accessToken: TOKEN, expiresAt: EXPIRES_AT, developerKey: DEVELOPER_KEY, appId: APP_ID },
      error: null,
    });
    expect(mocks.getPickerAccessToken).toHaveBeenCalledWith("user_1");
    expect(consoleOutput()).not.toContain(TOKEN);
  });

  it("giữ expiresAt = null khi Google không báo hạn", async () => {
    mocks.getPickerAccessToken.mockResolvedValue({ status: "ok", accessToken: TOKEN, expiresAt: null });
    const response = await GET();
    expect(response.status).toBe(200);
    expect((await response.json()).data.expiresAt).toBeNull();
  });

  it("trả 403 drive_not_connected no-store, body không có token", async () => {
    mocks.getPickerAccessToken.mockResolvedValue({ status: "not_connected" });
    const response = await GET();
    expect(response.status).toBe(403);
    expectNoStore(response);
    const json = await response.json();
    expect(json).toEqual({
      data: null,
      error: { message: "Bạn chưa kết nối Google Drive", code: "drive_not_connected" },
    });
    expect(JSON.stringify(json)).not.toContain("accessToken");
  });

  it("trả 502 no-store khi lấy token lỗi / quá hạn", async () => {
    mocks.getPickerAccessToken.mockResolvedValue({ status: "error" });
    const response = await GET();
    expect(response.status).toBe(502);
    expectNoStore(response);
    expect(await response.json()).toEqual({
      data: null,
      error: { message: "Không lấy được quyền truy cập Google Drive, vui lòng thử lại sau" },
    });
  });

  it("trả 500 no-store thông báo chung khi hàm server ném, không lộ message / token", async () => {
    mocks.getPickerAccessToken.mockRejectedValue(new Error("boom"));
    const response = await GET();
    expect(response.status).toBe(500);
    expectNoStore(response);
    const json = await response.json();
    expect(json.data).toBeNull();
    expect(json.error.message).toBe("Đã có lỗi xảy ra, vui lòng thử lại sau");
    expect(JSON.stringify(json)).not.toContain("boom");
    expect(console.error).toHaveBeenCalledWith("GET /api/drive/picker-token", expect.anything());
    expect(consoleOutput()).not.toContain(TOKEN);
  });

  it("trả 500 no-store khi getApiUserId ném, không lấy token", async () => {
    mocks.getApiUserId.mockRejectedValue(new Error("db down"));
    const response = await GET();
    expect(response.status).toBe(500);
    expectNoStore(response);
    expect(mocks.getPickerAccessToken).not.toHaveBeenCalled();
  });
});
