import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_PROJECT_FOLDER_NAME, DEFAULT_SPACE_FOLDER_NAME } from "@/domain/drive-folder-name";

import type { DriveFilesClient } from "./drive-folders";
import { DRIVE_FOLDER_MIME, rootFolderQuery } from "./drive-query";
import { GOOGLE_SCOPES } from "./scopes";

const mocks = vi.hoisted(() => ({
  loaded: { googleapis: false, client: false },
  hasGoogleScope: vi.fn(),
  getGoogleAuth: vi.fn(),
  googleDrive: vi.fn(),
}));

vi.mock("./granted-scopes", () => ({ hasGoogleScope: mocks.hasGoogleScope }));
vi.mock("googleapis", () => {
  mocks.loaded.googleapis = true;
  return { google: { drive: mocks.googleDrive } };
});
vi.mock("./client", () => {
  mocks.loaded.client = true;
  return { getGoogleAuth: mocks.getGoogleAuth };
});

import {
  DRIVE_REQUEST_TIMEOUT_MS,
  DRIVE_TOTAL_TIMEOUT_MS,
  defaultDeps,
  provisionProjectFolder,
  provisionSpaceFolder,
  type DriveProvisionDeps,
} from "./drive-provision";

const USER = "user-1";
const SPACE = { id: "space-1", name: "Marketing" };
const PROJECT = { id: "project-1", name: "Ra mắt" };
const SECRET_TOKEN = "ya29.SECRET-ACCESS-TOKEN";
const SECRET_URL = "https://www.googleapis.com/drive/v3/files?access_token=leak";

function fakeDrive() {
  const list = vi.fn();
  const create = vi.fn();
  const drive = { files: { list, create } } as unknown as DriveFilesClient;
  return { drive, list, create };
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

/** Theo dõi unhandledRejection trong một test (vitest cũng báo lỗi, đây là kiểm tra tường minh). */
function trackUnhandledRejections() {
  const seen: unknown[] = [];
  const onRejection = (reason: unknown) => seen.push(reason);
  process.on("unhandledRejection", onRejection);
  return {
    seen,
    async flush() {
      vi.useRealTimers();
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
      process.off("unhandledRejection", onRejection);
    },
  };
}

function namedError(name: string): Error {
  const error = new Error("chi tiết nội bộ");
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
  mocks.hasGoogleScope.mockReset();
  mocks.getGoogleAuth.mockReset();
  mocks.googleDrive.mockReset();
});

function expectSafeSingleLog(expected: Record<string, unknown>) {
  expect(errorSpy).toHaveBeenCalledTimes(1);
  const [message, fields] = errorSpy.mock.calls[0] as [string, Record<string, unknown>];
  expect(message).toBe("[google/drive] Không tạo được thư mục Drive");
  expect(fields).toEqual(expected);
  const json = JSON.stringify(errorSpy.mock.calls);
  expect(json).not.toContain(SECRET_TOKEN);
  expect(json).not.toContain("googleapis.com");
  expect(json).not.toContain("Bearer");
  expect(json).not.toContain("access_token");
}

describe("hằng số", () => {
  it("timeout mỗi request 5 s, hạn tổng 10 s", () => {
    expect(DRIVE_REQUEST_TIMEOUT_MS).toBe(5_000);
    expect(DRIVE_TOTAL_TIMEOUT_MS).toBe(10_000);
  });
});

describe("defaultDeps (không nạp googleapis khi thiếu scope)", () => {
  it("thiếu drive.file → không nạp ./client lẫn googleapis, trả null, không log", async () => {
    // Nạp lại module từ đầu để không phụ thuộc thứ tự test: các factory vi.mock chạy lại khi
    // (và chỉ khi) module tương ứng thực sự được import.
    vi.resetModules();
    mocks.loaded.googleapis = false;
    mocks.loaded.client = false;
    mocks.hasGoogleScope.mockResolvedValue(false);
    const fresh = await import("./drive-provision");

    await expect(fresh.provisionSpaceFolder(USER, SPACE)).resolves.toBeNull();
    await expect(
      fresh.provisionProjectFolder(USER, { spaceId: SPACE.id, parentFolderId: "sf", project: PROJECT }),
    ).resolves.toBeNull();

    expect(mocks.hasGoogleScope).toHaveBeenCalledWith(USER, GOOGLE_SCOPES.drive);
    expect(mocks.loaded).toEqual({ googleapis: false, client: false });
    expect(mocks.getGoogleAuth).not.toHaveBeenCalled();
    expect(mocks.googleDrive).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("hasDriveScope gọi hasGoogleScope với scope drive.file", async () => {
    mocks.hasGoogleScope.mockResolvedValue(true);
    await expect(defaultDeps.hasDriveScope(USER)).resolves.toBe(true);
    expect(mocks.hasGoogleScope).toHaveBeenCalledWith(USER, GOOGLE_SCOPES.drive);
  });

  it("getDrive: lấy auth theo user, tạo drive v3 với timeout và retry: false", async () => {
    const auth = { kind: "oauth2" };
    const driveClient = { files: {} };
    mocks.getGoogleAuth.mockResolvedValue(auth);
    mocks.googleDrive.mockReturnValue(driveClient);

    await expect(defaultDeps.getDrive(USER)).resolves.toBe(driveClient);

    expect(mocks.getGoogleAuth).toHaveBeenCalledWith(USER);
    expect(mocks.googleDrive).toHaveBeenCalledWith({
      version: "v3",
      auth,
      timeout: DRIVE_REQUEST_TIMEOUT_MS,
      retry: false,
    });
  });

  it("getDrive: getGoogleAuth ném → lỗi lan ra (provision sẽ bắt)", async () => {
    mocks.getGoogleAuth.mockRejectedValue(namedError("GoogleNotConnectedError"));
    await expect(defaultDeps.getDrive(USER)).rejects.toMatchObject({ name: "GoogleNotConnectedError" });
    expect(mocks.googleDrive).not.toHaveBeenCalled();
  });
});

describe("provisionSpaceFolder", () => {
  it("có scope → bảo đảm thư mục gốc rồi tạo thư mục không gian dưới gốc", async () => {
    const { drive, list, create } = fakeDrive();
    list.mockResolvedValue({ data: { files: [{ id: "root-1" }] } });
    create.mockResolvedValue({ data: { id: "space-folder-1" } });
    const { deps, getDrive } = fakeDeps(drive);

    await expect(provisionSpaceFolder(USER, SPACE, deps)).resolves.toBe("space-folder-1");

    expect(getDrive).toHaveBeenCalledWith(USER);
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ q: rootFolderQuery() }), {
      signal: expect.any(AbortSignal),
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      {
        requestBody: {
          name: "Marketing",
          mimeType: DRIVE_FOLDER_MIME,
          parents: ["root-1"],
          appProperties: { taskeoRole: "space", taskeoSpaceId: "space-1" },
        },
        fields: "id",
      },
      { signal: expect.any(AbortSignal) },
    );
    expect(list.mock.calls[0]?.[1].signal).toBe(create.mock.calls[0]?.[1].signal);
    expect(create.mock.calls[0]?.[1].signal.aborted).toBe(false);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("tên được chuẩn hoá; rỗng → tên mặc định", async () => {
    const { drive, list, create } = fakeDrive();
    list.mockResolvedValue({ data: { files: [{ id: "root-1" }] } });
    create.mockResolvedValue({ data: { id: "f" } });
    const { deps } = fakeDeps(drive);

    await provisionSpaceFolder(USER, { id: "s", name: "  Kế\n\thoạch\u0000  Q4 " }, deps);
    await provisionSpaceFolder(USER, { id: "s2", name: " ​\t " }, deps);

    expect(create.mock.calls[0]?.[0].requestBody.name).toBe("Kế hoạch Q4");
    expect(create.mock.calls[1]?.[0].requestBody.name).toBe(DEFAULT_SPACE_FOLDER_NAME);
  });

  it("không có scope → không gọi getDrive, trả null, không log", async () => {
    const { drive } = fakeDrive();
    const { deps, getDrive } = fakeDeps(drive);
    vi.mocked(deps.hasDriveScope).mockResolvedValue(false);

    await expect(provisionSpaceFolder(USER, SPACE, deps)).resolves.toBeNull();
    expect(getDrive).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("getDrive ném GoogleNotConnectedError → null, không log", async () => {
    const { drive, list } = fakeDrive();
    const { deps } = fakeDeps(drive);
    vi.mocked(deps.getDrive).mockRejectedValue(namedError("GoogleNotConnectedError"));

    await expect(provisionSpaceFolder(USER, SPACE, deps)).resolves.toBeNull();
    expect(list).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("Drive ném lỗi gaxios chứa token / URL → null, đúng một dòng log an toàn có status", async () => {
    const { drive, list } = fakeDrive();
    list.mockRejectedValue(fakeGaxiosError(403));
    const { deps } = fakeDeps(drive);

    await expect(provisionSpaceFolder(USER, SPACE, deps)).resolves.toBeNull();
    expectSafeSingleLog({ userId: USER, spaceId: "space-1", error: "GaxiosError", status: 403 });
  });

  it("hasDriveScope ném → null, log an toàn (không message)", async () => {
    const { drive } = fakeDrive();
    const { deps, getDrive } = fakeDeps(drive);
    vi.mocked(deps.hasDriveScope).mockRejectedValue(
      Object.assign(new Error(`db down ${SECRET_TOKEN}`), { name: "PrismaClientKnownRequestError" }),
    );

    await expect(provisionSpaceFolder(USER, SPACE, deps)).resolves.toBeNull();
    expect(getDrive).not.toHaveBeenCalled();
    expectSafeSingleLog({ userId: USER, spaceId: "space-1", error: "PrismaClientKnownRequestError" });
  });

  it("lỗi không phải Error (ném chuỗi chứa token) → null, log UnknownError", async () => {
    const { drive, list } = fakeDrive();
    list.mockRejectedValue(SECRET_TOKEN);
    const { deps } = fakeDeps(drive);

    await expect(provisionSpaceFolder(USER, SPACE, deps)).resolves.toBeNull();
    expectSafeSingleLog({ userId: USER, spaceId: "space-1", error: "UnknownError" });
  });

  it("quá hạn tổng (Drive không bao giờ trả) → null, log TimeoutError, dọn timer", async () => {
    vi.useFakeTimers();
    const { drive, list } = fakeDrive();
    list.mockReturnValue(new Promise(() => {}));
    const { deps } = fakeDeps(drive);

    const pending = provisionSpaceFolder(USER, SPACE, deps);
    await vi.advanceTimersByTimeAsync(DRIVE_TOTAL_TIMEOUT_MS - 1);
    expect(errorSpy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toBeNull();
    expectSafeSingleLog({ userId: USER, spaceId: "space-1", error: "TimeoutError" });
    expect(vi.getTimerCount()).toBe(0);
    const signal: AbortSignal = list.mock.calls[0]?.[1].signal;
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toMatchObject({ name: "TimeoutError" });
  });

  it("list resolve muộn (sau hạn) → vẫn null, signal đã huỷ, không gọi create", async () => {
    vi.useFakeTimers();
    const tracker = trackUnhandledRejections();
    const { drive, list, create } = fakeDrive();
    const late = deferred<{ data: { files: { id: string }[] } }>();
    list.mockReturnValue(late.promise);
    create.mockResolvedValue({ data: { id: "space-folder-late" } });
    const { deps } = fakeDeps(drive);

    const pending = provisionSpaceFolder(USER, SPACE, deps);
    await vi.advanceTimersByTimeAsync(DRIVE_TOTAL_TIMEOUT_MS);
    await expect(pending).resolves.toBeNull();
    expect(list.mock.calls[0]?.[1].signal.aborted).toBe(true);

    late.resolve({ data: { files: [{ id: "root-1" }] } });
    await tracker.flush();

    expect(create).not.toHaveBeenCalled();
    expectSafeSingleLog({ userId: USER, spaceId: "space-1", error: "TimeoutError" });
    expect(tracker.seen).toEqual([]);
  });

  it("list reject muộn (sau hạn) → đúng một dòng log (TimeoutError), không unhandled rejection", async () => {
    vi.useFakeTimers();
    const tracker = trackUnhandledRejections();
    const { drive, list, create } = fakeDrive();
    const late = deferred<never>();
    list.mockReturnValue(late.promise);
    const { deps } = fakeDeps(drive);

    const pending = provisionSpaceFolder(USER, SPACE, deps);
    await vi.advanceTimersByTimeAsync(DRIVE_TOTAL_TIMEOUT_MS);
    await expect(pending).resolves.toBeNull();

    late.reject(fakeGaxiosError(500));
    await tracker.flush();

    expect(create).not.toHaveBeenCalled();
    expectSafeSingleLog({ userId: USER, spaceId: "space-1", error: "TimeoutError" });
    expect(tracker.seen).toEqual([]);
  });

  it("getDrive resolve muộn (refresh token chậm) → không gọi list / create", async () => {
    vi.useFakeTimers();
    const { drive, list, create } = fakeDrive();
    const late = deferred<DriveFilesClient>();
    const { deps } = fakeDeps(drive);
    vi.mocked(deps.getDrive).mockReturnValue(late.promise);

    const pending = provisionSpaceFolder(USER, SPACE, deps);
    await vi.advanceTimersByTimeAsync(DRIVE_TOTAL_TIMEOUT_MS);
    await expect(pending).resolves.toBeNull();

    late.resolve(drive);
    await vi.advanceTimersByTimeAsync(0);

    expect(list).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expectSafeSingleLog({ userId: USER, spaceId: "space-1", error: "TimeoutError" });
  });

  it("hasDriveScope resolve muộn → không gọi getDrive", async () => {
    vi.useFakeTimers();
    const { drive } = fakeDrive();
    const late = deferred<boolean>();
    const { deps, getDrive } = fakeDeps(drive);
    vi.mocked(deps.hasDriveScope).mockReturnValue(late.promise);

    const pending = provisionSpaceFolder(USER, SPACE, deps);
    await vi.advanceTimersByTimeAsync(DRIVE_TOTAL_TIMEOUT_MS);
    await expect(pending).resolves.toBeNull();

    late.resolve(true);
    await vi.advanceTimersByTimeAsync(0);

    expect(getDrive).not.toHaveBeenCalled();
    expectSafeSingleLog({ userId: USER, spaceId: "space-1", error: "TimeoutError" });
  });

  it("Drive reject bằng AbortError khi bị huỷ → vẫn log TimeoutError (không lộ lỗi huỷ)", async () => {
    vi.useFakeTimers();
    const { drive, list } = fakeDrive();
    list.mockImplementation(
      (_params: unknown, options?: { signal?: AbortSignal }) =>
        new Promise((_, reject) => {
          options?.signal?.addEventListener("abort", () => reject(namedError("AbortError")));
        }),
    );
    const { deps } = fakeDeps(drive);

    const pending = provisionSpaceFolder(USER, SPACE, deps);
    await vi.advanceTimersByTimeAsync(DRIVE_TOTAL_TIMEOUT_MS);

    await expect(pending).resolves.toBeNull();
    expectSafeSingleLog({ userId: USER, spaceId: "space-1", error: "TimeoutError" });
  });

  it("totalTimeoutMs tuỳ chỉnh được; thành công thì timer được dọn", async () => {
    vi.useFakeTimers();
    const { drive, list, create } = fakeDrive();
    list.mockResolvedValue({ data: { files: [{ id: "root-1" }] } });
    create.mockResolvedValue({ data: { id: "space-folder-1" } });
    const { deps } = fakeDeps(drive, { totalTimeoutMs: 50 });

    await expect(provisionSpaceFolder(USER, SPACE, deps)).resolves.toBe("space-folder-1");
    expect(vi.getTimerCount()).toBe(0);

    list.mockReturnValue(new Promise(() => {}));
    const pending = provisionSpaceFolder(USER, SPACE, deps);
    await vi.advanceTimersByTimeAsync(50);
    await expect(pending).resolves.toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("provisionProjectFolder", () => {
  const INPUT = { spaceId: "space-1", parentFolderId: "space-folder-0", project: PROJECT };

  it("tạo thư mục dự án dưới parentFolderId; không tìm thư mục gốc, không tạo thư mục không gian", async () => {
    const { drive, list, create } = fakeDrive();
    create.mockResolvedValue({ data: { id: "project-folder-1" } });
    const { deps, getDrive } = fakeDeps(drive);

    await expect(provisionProjectFolder(USER, INPUT, deps)).resolves.toBe("project-folder-1");

    expect(getDrive).toHaveBeenCalledWith(USER);
    expect(list).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      {
        requestBody: {
          name: "Ra mắt",
          mimeType: DRIVE_FOLDER_MIME,
          parents: ["space-folder-0"],
          appProperties: { taskeoRole: "project", taskeoProjectId: "project-1" },
        },
        fields: "id",
      },
      { signal: expect.any(AbortSignal) },
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("tên dự án được chuẩn hoá; rỗng → tên mặc định", async () => {
    const { drive, create } = fakeDrive();
    create.mockResolvedValue({ data: { id: "f" } });
    const { deps } = fakeDeps(drive);

    await provisionProjectFolder(USER, { ...INPUT, project: { id: "p", name: "  Q4\n\tplan " } }, deps);
    await provisionProjectFolder(USER, { ...INPUT, project: { id: "p2", name: "\u0007\n" } }, deps);

    expect(create.mock.calls[0]?.[0].requestBody.name).toBe("Q4 plan");
    expect(create.mock.calls[1]?.[0].requestBody.name).toBe(DEFAULT_PROJECT_FOLDER_NAME);
  });

  it("Drive lỗi → null, một dòng log an toàn có spaceId + projectId", async () => {
    const { drive, create } = fakeDrive();
    create.mockRejectedValue(fakeGaxiosError(404));
    const { deps } = fakeDeps(drive);

    await expect(provisionProjectFolder(USER, INPUT, deps)).resolves.toBeNull();
    expectSafeSingleLog({
      userId: USER,
      spaceId: "space-1",
      projectId: "project-1",
      error: "GaxiosError",
      status: 404,
    });
  });

  it("không có scope → không gọi getDrive, null, không log", async () => {
    const { drive } = fakeDrive();
    const { deps, getDrive } = fakeDeps(drive);
    vi.mocked(deps.hasDriveScope).mockResolvedValue(false);

    await expect(provisionProjectFolder(USER, INPUT, deps)).resolves.toBeNull();
    expect(getDrive).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("getDrive ném GoogleNotConnectedError → null, không log", async () => {
    const { drive, create } = fakeDrive();
    const { deps } = fakeDeps(drive);
    vi.mocked(deps.getDrive).mockRejectedValue(namedError("GoogleNotConnectedError"));

    await expect(provisionProjectFolder(USER, INPUT, deps)).resolves.toBeNull();
    expect(create).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("hasDriveScope ném → null, log an toàn", async () => {
    const { drive } = fakeDrive();
    const { deps } = fakeDeps(drive);
    vi.mocked(deps.hasDriveScope).mockRejectedValue(new TypeError(`bad ${SECRET_TOKEN}`));

    await expect(provisionProjectFolder(USER, INPUT, deps)).resolves.toBeNull();
    expectSafeSingleLog({ userId: USER, spaceId: "space-1", projectId: "project-1", error: "TypeError" });
  });

  it("create resolve muộn (sau hạn) → vẫn null, signal đã huỷ, log TimeoutError một lần", async () => {
    vi.useFakeTimers();
    const tracker = trackUnhandledRejections();
    const { drive, create } = fakeDrive();
    const late = deferred<{ data: { id: string } }>();
    create.mockReturnValue(late.promise);
    const { deps } = fakeDeps(drive);

    const pending = provisionProjectFolder(USER, INPUT, deps);
    await vi.advanceTimersByTimeAsync(DRIVE_TOTAL_TIMEOUT_MS);
    await expect(pending).resolves.toBeNull();
    const signal: AbortSignal = create.mock.calls[0]?.[1].signal;
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toMatchObject({ name: "TimeoutError" });
    expect(vi.getTimerCount()).toBe(0);

    late.resolve({ data: { id: "project-folder-late" } });
    await tracker.flush();

    expectSafeSingleLog({
      userId: USER,
      spaceId: "space-1",
      projectId: "project-1",
      error: "TimeoutError",
    });
    expect(tracker.seen).toEqual([]);
  });

  it("create reject muộn (sau hạn) → đúng một dòng log, không unhandled rejection", async () => {
    vi.useFakeTimers();
    const tracker = trackUnhandledRejections();
    const { drive, create } = fakeDrive();
    const late = deferred<never>();
    create.mockReturnValue(late.promise);
    const { deps } = fakeDeps(drive);

    const pending = provisionProjectFolder(USER, INPUT, deps);
    await vi.advanceTimersByTimeAsync(DRIVE_TOTAL_TIMEOUT_MS);
    await expect(pending).resolves.toBeNull();

    late.reject(fakeGaxiosError(503));
    await tracker.flush();

    expectSafeSingleLog({
      userId: USER,
      spaceId: "space-1",
      projectId: "project-1",
      error: "TimeoutError",
    });
    expect(tracker.seen).toEqual([]);
  });

  it("getDrive resolve muộn → không gọi create", async () => {
    vi.useFakeTimers();
    const { drive, create } = fakeDrive();
    const late = deferred<DriveFilesClient>();
    const { deps } = fakeDeps(drive);
    vi.mocked(deps.getDrive).mockReturnValue(late.promise);

    const pending = provisionProjectFolder(USER, INPUT, deps);
    await vi.advanceTimersByTimeAsync(DRIVE_TOTAL_TIMEOUT_MS);
    await expect(pending).resolves.toBeNull();

    late.resolve(drive);
    await vi.advanceTimersByTimeAsync(0);

    expect(create).not.toHaveBeenCalled();
  });
});
