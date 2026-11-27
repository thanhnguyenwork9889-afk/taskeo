import { afterEach, describe, expect, it, vi } from "vitest";
import type { DriveStorage } from "@/domain/types";
import { DRIVE_STORAGE_PATH, shouldRetryDriveStorage } from "./drive-storage-api";
import { DRIVE_STORAGE_QUERY_KEY, DRIVE_STORAGE_STALE_TIME_MS, driveStorageQueryOptions } from "./drive-storage-query";

const STORAGE: DriveStorage = { usage: 10, limit: 100, usageInDrive: 5, usageInDriveTrash: 1 };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("driveStorageQueryOptions", () => {
  it("demo → không gọi API (enabled false), kể cả khi đã kết nối", () => {
    expect(driveStorageQueryOptions({ isDemo: true, driveConnected: true }).enabled).toBe(false);
    expect(driveStorageQueryOptions({ isDemo: true, driveConnected: false }).enabled).toBe(false);
  });

  it("chưa kết nối Drive → không gọi API", () => {
    expect(driveStorageQueryOptions({ isDemo: false, driveConnected: false }).enabled).toBe(false);
  });

  it("configured + đã kết nối → gọi API", () => {
    expect(driveStorageQueryOptions({ isDemo: false, driveConnected: true }).enabled).toBe(true);
  });

  it("queryKey cố định, staleTime 5 phút, retry dùng shouldRetryDriveStorage", () => {
    const options = driveStorageQueryOptions({ isDemo: false, driveConnected: true });
    expect(options.queryKey).toEqual(["drive-storage"]);
    expect(options.queryKey).toBe(DRIVE_STORAGE_QUERY_KEY);
    expect(options.staleTime).toBe(300_000);
    expect(DRIVE_STORAGE_STALE_TIME_MS).toBe(300_000);
    expect(options.retry).toBe(shouldRetryDriveStorage);
  });

  it("queryFn gọi /api/drive/storage với signal của TanStack", async () => {
    const fake = vi.fn(async () => new Response(JSON.stringify({ data: { storage: STORAGE }, error: null }), { status: 200 }));
    vi.stubGlobal("fetch", fake);
    const controller = new AbortController();
    const { queryFn } = driveStorageQueryOptions({ isDemo: false, driveConnected: true });
    await expect(queryFn({ signal: controller.signal })).resolves.toEqual(STORAGE);
    expect(fake).toHaveBeenCalledWith(DRIVE_STORAGE_PATH, expect.objectContaining({ signal: controller.signal }));
  });
});
