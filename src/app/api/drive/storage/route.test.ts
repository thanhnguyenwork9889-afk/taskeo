import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DriveStorage } from "@/domain/types";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(async () => undefined),
  getApiUserId: vi.fn(),
  getDriveStorageQuota: vi.fn(),
  serverModuleLoaded: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("@/server/auth/session", () => ({ getApiUserId: mocks.getApiUserId }));
// Factory đặt tên để `freshRoute` đăng ký lại bằng `vi.doMock` (xoá kết quả mock đã cache).
const serverDriveStorageModule = vi.hoisted(() => () => {
  mocks.serverModuleLoaded();
  return { getDriveStorageQuota: mocks.getDriveStorageQuota };
});

vi.mock("@/server/google/drive-storage", serverDriveStorageModule);

import { GET } from "./route";

const STORAGE: DriveStorage = {
  usage: 3_435_973_837,
  limit: 16_106_127_360,
  usageInDrive: 1_073_741_824,
  usageInDriveTrash: 0,
};

/**
 * Nạp lại route với module cache sạch: factory `vi.mock("@/server/google/drive-storage")` chạy
 * lại nếu route import module đó, nên `serverModuleLoaded` phản ánh đúng lần gọi này.
 */
async function freshRoute(): Promise<typeof import("./route")> {
  vi.resetModules();
  vi.doMock("@/server/google/drive-storage", serverDriveStorageModule);
  return import("./route");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.getApiUserId.mockResolvedValue({ ok: true, userId: "user_1" });
  mocks.getDriveStorageQuota.mockResolvedValue({ status: "ok", storage: STORAGE });
});

describe("GET /api/drive/storage — phiên", () => {
  it("chờ connection() trước khi đọc phiên", async () => {
    await GET();
    expect(mocks.connection).toHaveBeenCalledTimes(1);
  });

  it("trả 401 khi chưa đăng nhập, không import và không gọi hàm server", async () => {
    mocks.getApiUserId.mockResolvedValue({ ok: false, status: 401 });
    const { GET: freshGet } = await freshRoute();
    const response = await freshGet();
    expect(response.status).toBe(401);
    expect((await response.json()).data).toBeNull();
    expect(mocks.serverModuleLoaded).not.toHaveBeenCalled();
    expect(mocks.getDriveStorageQuota).not.toHaveBeenCalled();
  });

  it("trả 503 ở chế độ demo và không import @/server/google/drive-storage", async () => {
    mocks.getApiUserId.mockResolvedValue({ ok: false, status: 503 });
    const { GET: freshGet } = await freshRoute();
    const response = await freshGet();
    expect(response.status).toBe(503);
    expect((await response.json()).data).toBeNull();
    expect(mocks.serverModuleLoaded).not.toHaveBeenCalled();
    expect(mocks.getDriveStorageQuota).not.toHaveBeenCalled();
  });
});

describe("GET /api/drive/storage — kết quả", () => {
  it("trả 200 { data: { storage }, error: null } với userId của phiên", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { storage: STORAGE }, error: null });
    expect(mocks.getDriveStorageQuota).toHaveBeenCalledWith("user_1");
  });

  it("giữ limit = null (không giới hạn)", async () => {
    const unlimited: DriveStorage = { ...STORAGE, limit: null };
    mocks.getDriveStorageQuota.mockResolvedValue({ status: "ok", storage: unlimited });
    const response = await GET();
    expect(response.status).toBe(200);
    expect((await response.json()).data.storage.limit).toBeNull();
  });

  it("trả 403 có code drive_not_connected khi chưa kết nối Drive", async () => {
    mocks.getDriveStorageQuota.mockResolvedValue({ status: "not_connected" });
    const response = await GET();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      data: null,
      error: { message: "Bạn chưa kết nối Google Drive", code: "drive_not_connected" },
    });
  });

  it("trả 502 khi Google lỗi / quá hạn", async () => {
    mocks.getDriveStorageQuota.mockResolvedValue({ status: "error" });
    const response = await GET();
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      data: null,
      error: { message: "Không lấy được dung lượng Google Drive, vui lòng thử lại sau" },
    });
  });

  it("trả 500 thông báo chung khi hàm server ném, không lộ message", async () => {
    mocks.getDriveStorageQuota.mockRejectedValue(new Error("secret token ya29.xxx"));
    const response = await GET();
    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.data).toBeNull();
    expect(json.error.message).toBe("Đã có lỗi xảy ra, vui lòng thử lại sau");
    expect(JSON.stringify(json)).not.toContain("ya29");
    expect(console.error).toHaveBeenCalledWith("GET /api/drive/storage", expect.anything());
  });

  it("trả 500 khi getApiUserId ném", async () => {
    mocks.getApiUserId.mockRejectedValue(new Error("db down"));
    const response = await GET();
    expect(response.status).toBe(500);
    expect(mocks.getDriveStorageQuota).not.toHaveBeenCalled();
  });
});
