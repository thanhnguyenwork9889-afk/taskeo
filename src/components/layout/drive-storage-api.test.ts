import { afterEach, describe, expect, it, vi } from "vitest";
import type { DriveStorage } from "@/domain/types";
import { DRIVE_NOT_CONNECTED_CODE } from "@/domain/drive-files";
import {
  DRIVE_STORAGE_PATH,
  DriveStorageRequestError,
  fetchDriveStorage,
  shouldRetryDriveStorage,
} from "./drive-storage-api";

const STORAGE: DriveStorage = {
  usage: 3_435_973_837,
  limit: 16_106_127_360,
  usageInDrive: 1_073_741_824,
  usageInDriveTrash: 0,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function stubFetch(response: Response) {
  const fake = vi.fn(async () => response);
  vi.stubGlobal("fetch", fake);
  return fake;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function rejection(promise: Promise<unknown>): Promise<DriveStorageRequestError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(DriveStorageRequestError);
    return error as DriveStorageRequestError;
  }
  throw new Error("expected rejection");
}

describe("DRIVE_STORAGE_PATH", () => {
  it("là /api/drive/storage", () => {
    expect(DRIVE_STORAGE_PATH).toBe("/api/drive/storage");
  });
});

describe("DriveStorageRequestError", () => {
  it("mang message, status, code và name riêng", () => {
    const error = new DriveStorageRequestError("x", 403, DRIVE_NOT_CONNECTED_CODE);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("DriveStorageRequestError");
    expect(error.message).toBe("x");
    expect(error.status).toBe(403);
    expect(error.code).toBe(DRIVE_NOT_CONNECTED_CODE);
  });
});

describe("fetchDriveStorage", () => {
  it("200 → trả storage, gọi đúng URL, Accept JSON và truyền signal", async () => {
    const fake = stubFetch(jsonResponse({ data: { storage: STORAGE }, error: null }));
    const controller = new AbortController();
    await expect(fetchDriveStorage(controller.signal)).resolves.toEqual(STORAGE);
    expect(fake).toHaveBeenCalledWith(
      "/api/drive/storage",
      expect.objectContaining({ signal: controller.signal, headers: { Accept: "application/json" } }),
    );
  });

  it("200 với limit null (không giới hạn) → hợp lệ", async () => {
    const storage = { ...STORAGE, limit: null };
    stubFetch(jsonResponse({ data: { storage }, error: null }));
    await expect(fetchDriveStorage()).resolves.toEqual(storage);
  });

  it("200 với usage = 0 → hợp lệ", async () => {
    const storage = { usage: 0, limit: 1, usageInDrive: 0, usageInDriveTrash: 0 };
    stubFetch(jsonResponse({ data: { storage }, error: null }));
    await expect(fetchDriveStorage()).resolves.toEqual(storage);
  });

  it.each([
    ["không phải object", ["x"]],
    ["data null", { data: null, error: null }],
    ["thiếu storage", { data: {}, error: null }],
    ["storage là mảng", { data: { storage: [] }, error: null }],
    ["usage là chuỗi", { data: { storage: { ...STORAGE, usage: "1" } }, error: null }],
    ["usage âm", { data: { storage: { ...STORAGE, usage: -1 } }, error: null }],
    ["usageInDrive thiếu", { data: { storage: { ...STORAGE, usageInDrive: undefined } }, error: null }],
    ["usageInDriveTrash âm", { data: { storage: { ...STORAGE, usageInDriveTrash: -5 } }, error: null }],
    ["limit = 0", { data: { storage: { ...STORAGE, limit: 0 } }, error: null }],
    ["limit âm", { data: { storage: { ...STORAGE, limit: -1 } }, error: null }],
    ["limit chuỗi", { data: { storage: { ...STORAGE, limit: "15" } }, error: null }],
    ["limit thiếu", { data: { storage: { ...STORAGE, limit: undefined } }, error: null }],
  ])("200 sai hình dạng (%s) → DriveStorageRequestError", async (_label, body) => {
    stubFetch(jsonResponse(body));
    const error = await rejection(fetchDriveStorage());
    expect(error.status).toBe(200);
  });

  it("200 nhưng JSON hỏng → DriveStorageRequestError status 200", async () => {
    stubFetch(new Response("{not json", { status: 200 }));
    const error = await rejection(fetchDriveStorage());
    expect(error.status).toBe(200);
  });

  it("403 kèm code drive_not_connected → lỗi mang status, code, message", async () => {
    stubFetch(jsonResponse({ data: null, error: { message: "Chưa kết nối Drive", code: DRIVE_NOT_CONNECTED_CODE } }, 403));
    const error = await rejection(fetchDriveStorage());
    expect(error.status).toBe(403);
    expect(error.code).toBe(DRIVE_NOT_CONNECTED_CODE);
    expect(error.message).toBe("Chưa kết nối Drive");
  });

  it("502 có message, không code → giữ message, code undefined", async () => {
    stubFetch(jsonResponse({ data: null, error: { message: "Google lỗi" } }, 502));
    const error = await rejection(fetchDriveStorage());
    expect(error.status).toBe(502);
    expect(error.message).toBe("Google lỗi");
    expect(error.code).toBeUndefined();
  });

  it("lỗi với body không phải JSON → giữ status, thông điệp mặc định", async () => {
    stubFetch(new Response("<html>Bad gateway</html>", { status: 503 }));
    const error = await rejection(fetchDriveStorage());
    expect(error.status).toBe(503);
    expect(error.message.trim().length).toBeGreaterThan(0);
  });

  it("message rỗng / khoảng trắng, code không phải chuỗi → thông điệp mặc định, bỏ code", async () => {
    stubFetch(jsonResponse({ data: null, error: { message: "   ", code: 42 } }, 401));
    const error = await rejection(fetchDriveStorage());
    expect(error.status).toBe(401);
    expect(error.message.trim().length).toBeGreaterThan(0);
    expect(error.code).toBeUndefined();
  });

  it("bị huỷ khi đang đọc body → ném lại lý do huỷ", async () => {
    const controller = new AbortController();
    const response = new Response("{}", { status: 200 });
    vi.spyOn(response, "json").mockImplementation(async () => {
      controller.abort();
      throw new DOMException("The operation was aborted.", "AbortError");
    });
    stubFetch(response);
    const error = await fetchDriveStorage(controller.signal).catch((reason: unknown) => reason);
    expect(error).not.toBeInstanceOf(DriveStorageRequestError);
    expect(error).toBe(controller.signal.reason);
  });

  it("bị huỷ khi đọc body của phản hồi lỗi → cũng ném lại lý do huỷ", async () => {
    const controller = new AbortController();
    const response = new Response("{}", { status: 502 });
    vi.spyOn(response, "json").mockImplementation(async () => {
      controller.abort(new DOMException("stop", "AbortError"));
      throw new DOMException("stop", "AbortError");
    });
    stubFetch(response);
    const error = await fetchDriveStorage(controller.signal).catch((reason: unknown) => reason);
    expect(error).toBe(controller.signal.reason);
    expect(error).toMatchObject({ name: "AbortError" });
  });
});

describe("shouldRetryDriveStorage", () => {
  it.each([400, 401, 403, 404, 500, 502, 503])("không retry khi server đã trả lời %i", (status) => {
    expect(shouldRetryDriveStorage(0, new DriveStorageRequestError("x", status))).toBe(false);
  });

  it("lỗi mạng retry tối đa 1 lần", () => {
    const error = new TypeError("Failed to fetch");
    expect(shouldRetryDriveStorage(0, error)).toBe(true);
    expect(shouldRetryDriveStorage(1, error)).toBe(false);
  });
});
