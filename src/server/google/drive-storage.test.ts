import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DriveFilesClient } from "./drive-folders";

const mocks = vi.hoisted(() => ({
  hasGoogleScope: vi.fn(),
  getGoogleAuth: vi.fn(),
  googleDrive: vi.fn(),
}));

vi.mock("./granted-scopes", () => ({ hasGoogleScope: mocks.hasGoogleScope }));
vi.mock("googleapis", () => ({ google: { drive: mocks.googleDrive } }));
vi.mock("./client", () => ({ getGoogleAuth: mocks.getGoogleAuth }));

import { DRIVE_TOTAL_TIMEOUT_MS, type DriveProvisionDeps } from "./drive-provision";
import { DRIVE_STORAGE_FIELDS, getDriveStorageQuota } from "./drive-storage";
import { GOOGLE_SCOPES } from "./scopes";

const USER = "user-1";
const SECRET_TOKEN = "ya29.SECRET-ACCESS-TOKEN";
const SECRET_URL = "https://www.googleapis.com/drive/v3/about?access_token=leak";

const QUOTA = {
  limit: "16106127360",
  usage: "3435973837",
  usageInDrive: "1073741824",
  usageInDriveTrash: "1024",
};

function fakeDrive() {
  const get = vi.fn();
  const list = vi.fn();
  const drive = { about: { get }, files: { list } } as unknown as DriveFilesClient;
  return { drive, get, list };
}

function fakeDeps(drive: DriveFilesClient, overrides: Partial<DriveProvisionDeps> = {}) {
  const hasDriveScope = vi.fn<DriveProvisionDeps["hasDriveScope"]>().mockResolvedValue(true);
  const getDrive = vi.fn<DriveProvisionDeps["getDrive"]>().mockResolvedValue(drive);
  const deps: DriveProvisionDeps = { hasDriveScope, getDrive, ...overrides };
  return { deps, hasDriveScope, getDrive };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function namedError(name: string): Error {
  const error = new Error(`chi tiết nội bộ ${SECRET_TOKEN}`);
  error.name = name;
  return error;
}

function fakeGaxiosError(status: number) {
  const error = new Error(`Request failed: Bearer ${SECRET_TOKEN} ${SECRET_URL}`);
  return Object.assign(error, {
    status,
    config: { url: SECRET_URL, headers: { Authorization: `Bearer ${SECRET_TOKEN}` } },
    response: { status, data: { error: { message: SECRET_TOKEN } } },
  });
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mocks.hasGoogleScope.mockReset();
  mocks.getGoogleAuth.mockReset();
  mocks.googleDrive.mockReset();
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function expectSafeSingleLog(expected: Record<string, unknown>) {
  expect(errorSpy).toHaveBeenCalledTimes(1);
  const [message, fields] = errorSpy.mock.calls[0] as [string, Record<string, unknown>];
  expect(message).toBe("[google/drive] Không lấy được dung lượng Drive");
  expect(fields).toEqual(expected);
  const json = JSON.stringify(errorSpy.mock.calls);
  expect(json).not.toContain(SECRET_TOKEN);
  expect(json).not.toContain("googleapis.com");
  expect(json).not.toContain("Bearer");
  expect(json).not.toContain("access_token");
}

describe("getDriveStorageQuota", () => {
  it("không có scope → not_connected, không gọi getDrive, không log", async () => {
    const { drive, get } = fakeDrive();
    const { deps, hasDriveScope, getDrive } = fakeDeps(drive);
    hasDriveScope.mockResolvedValue(false);

    await expect(getDriveStorageQuota(USER, deps)).resolves.toEqual({ status: "not_connected" });
    expect(hasDriveScope).toHaveBeenCalledWith(USER);
    expect(getDrive).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("chỉ xin fields storageQuota, truyền signal, trả DriveStorage có limit", async () => {
    const { drive, get } = fakeDrive();
    get.mockResolvedValue({ data: { storageQuota: QUOTA } });
    const { deps, getDrive } = fakeDeps(drive);

    await expect(getDriveStorageQuota(USER, deps)).resolves.toEqual({
      status: "ok",
      storage: {
        usage: 3435973837,
        limit: 16106127360,
        usageInDrive: 1073741824,
        usageInDriveTrash: 1024,
      },
    });
    expect(getDrive).toHaveBeenCalledWith(USER);
    expect(DRIVE_STORAGE_FIELDS).toBe("storageQuota");
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith({ fields: "storageQuota" }, { signal: expect.any(AbortSignal) });
    expect(get.mock.calls[0]?.[1].signal.aborted).toBe(false);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("không có limit → limit null (không giới hạn)", async () => {
    const { drive, get } = fakeDrive();
    get.mockResolvedValue({ data: { storageQuota: { usage: "2048" } } });
    const { deps } = fakeDeps(drive);

    await expect(getDriveStorageQuota(USER, deps)).resolves.toEqual({
      status: "ok",
      storage: { usage: 2048, limit: null, usageInDrive: 0, usageInDriveTrash: 0 },
    });
  });

  it.each([
    ["storageQuota thiếu", {}],
    ["usage thiếu", { storageQuota: { limit: "100" } }],
    ["usage sai định dạng", { storageQuota: { usage: "-5", limit: "100" } }],
    ["limit sai định dạng", { storageQuota: { usage: "5", limit: "abc" } }],
  ])("%s → error, log tên lỗi an toàn", async (_label, data) => {
    const { drive, get } = fakeDrive();
    get.mockResolvedValue({ data });
    const { deps } = fakeDeps(drive);

    await expect(getDriveStorageQuota(USER, deps)).resolves.toEqual({ status: "error" });
    expectSafeSingleLog({ userId: USER, error: "MalformedStorageQuotaError" });
  });

  it("getDrive ném GoogleNotConnectedError → not_connected, không log", async () => {
    const { drive, get } = fakeDrive();
    const { deps, getDrive } = fakeDeps(drive);
    getDrive.mockRejectedValue(namedError("GoogleNotConnectedError"));

    await expect(getDriveStorageQuota(USER, deps)).resolves.toEqual({ status: "not_connected" });
    expect(get).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("GoogleScopeMissingError → not_connected, không log", async () => {
    const { drive } = fakeDrive();
    const { deps, getDrive } = fakeDeps(drive);
    getDrive.mockRejectedValue(namedError("GoogleScopeMissingError"));

    await expect(getDriveStorageQuota(USER, deps)).resolves.toEqual({ status: "not_connected" });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("lỗi gaxios 500 mang token / URL → error, đúng một dòng log an toàn", async () => {
    const { drive, get } = fakeDrive();
    get.mockRejectedValue(fakeGaxiosError(500));
    const { deps } = fakeDeps(drive);

    await expect(getDriveStorageQuota(USER, deps)).resolves.toEqual({ status: "error" });
    expectSafeSingleLog({ userId: USER, error: "GaxiosError", status: 500 });
  });

  it("hasDriveScope ném → error, log an toàn, không gọi getDrive", async () => {
    const { drive } = fakeDrive();
    const { deps, hasDriveScope, getDrive } = fakeDeps(drive);
    hasDriveScope.mockRejectedValue(namedError("PrismaClientKnownRequestError"));

    await expect(getDriveStorageQuota(USER, deps)).resolves.toEqual({ status: "error" });
    expect(getDrive).not.toHaveBeenCalled();
    expectSafeSingleLog({ userId: USER, error: "PrismaClientKnownRequestError" });
  });

  it("quá hạn tổng mặc định → error, signal huỷ, log TimeoutError, dọn timer", async () => {
    vi.useFakeTimers();
    const { drive, get } = fakeDrive();
    const late = deferred<{ data: unknown }>();
    get.mockReturnValue(late.promise);
    const { deps } = fakeDeps(drive);

    const pending = getDriveStorageQuota(USER, deps);
    await vi.advanceTimersByTimeAsync(DRIVE_TOTAL_TIMEOUT_MS - 1);
    expect(errorSpy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toEqual({ status: "error" });
    expect(vi.getTimerCount()).toBe(0);
    const signal: AbortSignal = get.mock.calls[0]?.[1].signal;
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toMatchObject({ name: "TimeoutError" });

    late.resolve({ data: { storageQuota: QUOTA } });
    await vi.advanceTimersByTimeAsync(0);
    expectSafeSingleLog({ userId: USER, error: "TimeoutError" });
  });

  it("totalTimeoutMs nhỏ + promise treo → error, signal bị abort", async () => {
    vi.useFakeTimers();
    const { drive, get } = fakeDrive();
    get.mockReturnValue(new Promise(() => {}));
    const { deps } = fakeDeps(drive, { totalTimeoutMs: 50 });

    const pending = getDriveStorageQuota(USER, deps);
    await vi.advanceTimersByTimeAsync(50);
    await expect(pending).resolves.toEqual({ status: "error" });
    expect(get.mock.calls[0]?.[1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expectSafeSingleLog({ userId: USER, error: "TimeoutError" });
  });

  it("getDrive resolve muộn (sau hạn) → không gọi about.get", async () => {
    vi.useFakeTimers();
    const { drive, get } = fakeDrive();
    const late = deferred<DriveFilesClient>();
    const { deps, getDrive } = fakeDeps(drive);
    getDrive.mockReturnValue(late.promise);

    const pending = getDriveStorageQuota(USER, deps);
    await vi.advanceTimersByTimeAsync(DRIVE_TOTAL_TIMEOUT_MS);
    await expect(pending).resolves.toEqual({ status: "error" });

    late.resolve(drive);
    await vi.advanceTimersByTimeAsync(0);
    expect(get).not.toHaveBeenCalled();
  });
});

describe("getDriveStorageQuota với defaultDeps", () => {
  it("thiếu drive.file → kiểm đúng scope, không nạp client / googleapis", async () => {
    mocks.hasGoogleScope.mockResolvedValue(false);

    await expect(getDriveStorageQuota(USER)).resolves.toEqual({ status: "not_connected" });
    expect(mocks.hasGoogleScope).toHaveBeenCalledWith(USER, GOOGLE_SCOPES.drive);
    expect(mocks.getGoogleAuth).not.toHaveBeenCalled();
    expect(mocks.googleDrive).not.toHaveBeenCalled();
  });

  it("có scope → dùng client theo user", async () => {
    const { drive, get } = fakeDrive();
    get.mockResolvedValue({ data: { storageQuota: QUOTA } });
    mocks.hasGoogleScope.mockResolvedValue(true);
    mocks.getGoogleAuth.mockResolvedValue({ kind: "oauth2" });
    mocks.googleDrive.mockReturnValue(drive);

    await expect(getDriveStorageQuota(USER)).resolves.toMatchObject({ status: "ok" });
    expect(mocks.getGoogleAuth).toHaveBeenCalledWith(USER);
  });
});
