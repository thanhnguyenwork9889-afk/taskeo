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

import { DOC_KIND_MIME, DRIVE_FILE_CREATE_FIELDS } from "@/domain/drive-files";
import type { DocKind } from "@/domain/types";

import { DRIVE_LIST_FIELDS, createDriveFile, listDriveFiles } from "./drive-files";
import { DRIVE_TOTAL_TIMEOUT_MS, type DriveProvisionDeps } from "./drive-provision";
import { GOOGLE_SCOPES } from "./scopes";

const USER = "user-1";
const SECRET_TOKEN = "ya29.SECRET-ACCESS-TOKEN";
const SECRET_URL = "https://www.googleapis.com/drive/v3/files?access_token=leak";
const Q1 = "mimeType='application/vnd.google-apps.document' and trashed=false and ('a' in parents)";
const Q2 = "mimeType='application/vnd.google-apps.document' and trashed=false and ('b' in parents)";

function file(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name: `File ${id}`,
    mimeType: "application/vnd.google-apps.document",
    modifiedTime: "2026-11-27T10:00:00.000Z",
    webViewLink: `https://docs.google.com/document/d/${id}/edit`,
    parents: ["a"],
    ...extra,
  };
}

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

const pendingCleanups: (() => void)[] = [];

function trackUnhandledRejections() {
  const seen: unknown[] = [];
  const onRejection = (reason: unknown) => seen.push(reason);
  process.on("unhandledRejection", onRejection);
  pendingCleanups.push(() => process.off("unhandledRejection", onRejection));
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
  for (const cleanup of pendingCleanups.splice(0)) cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const LIST_LOG = "[google/drive] Không liệt kê được file Drive";
const CREATE_LOG = "[google/drive] Không tạo được file Drive";

function expectSafeSingleLog(expected: Record<string, unknown>, expectedMessage = LIST_LOG) {
  expect(errorSpy).toHaveBeenCalledTimes(1);
  const [message, fields] = errorSpy.mock.calls[0] as [string, Record<string, unknown>];
  expect(message).toBe(expectedMessage);
  expect(fields).toEqual(expected);
  const json = JSON.stringify(errorSpy.mock.calls);
  expect(json).not.toContain(SECRET_TOKEN);
  expect(json).not.toContain("googleapis.com");
  expect(json).not.toContain("Bearer");
  expect(json).not.toContain("access_token");
}

describe("listDriveFiles", () => {
  it("không có scope → not_connected, không gọi getDrive, không log", async () => {
    const { drive, list } = fakeDrive();
    const { deps, hasDriveScope, getDrive } = fakeDeps(drive);
    hasDriveScope.mockResolvedValue(false);

    await expect(listDriveFiles(USER, [Q1], 20, deps)).resolves.toEqual({ status: "not_connected" });
    expect(hasDriveScope).toHaveBeenCalledWith(USER);
    expect(getDrive).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("queries rỗng → ok [], không kiểm scope, không gọi Google", async () => {
    const { drive, list } = fakeDrive();
    const { deps, hasDriveScope, getDrive } = fakeDeps(drive);

    await expect(listDriveFiles(USER, [], 20, deps)).resolves.toEqual({ status: "ok", files: [] });
    expect(hasDriveScope).not.toHaveBeenCalled();
    expect(getDrive).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });

  it("gọi files.list đúng tham số tối thiểu và trả file", async () => {
    const { drive, list } = fakeDrive();
    list.mockResolvedValue({ data: { files: [file("f1")] } });
    const { deps, getDrive } = fakeDeps(drive);

    await expect(listDriveFiles(USER, [Q1], 7, deps)).resolves.toEqual({
      status: "ok",
      files: [file("f1")],
    });
    expect(getDrive).toHaveBeenCalledWith(USER);
    expect(DRIVE_LIST_FIELDS).toBe("files(id,name,mimeType,modifiedTime,webViewLink,parents)");
    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith(
      {
        q: Q1,
        orderBy: "modifiedTime desc",
        pageSize: 7,
        fields: DRIVE_LIST_FIELDS,
        spaces: "drive",
      },
      { signal: expect.any(AbortSignal) },
    );
    expect(list.mock.calls[0]?.[1].signal.aborted).toBe(false);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("chỉ giữ 6 trường đã xin; files thiếu → coi như rỗng", async () => {
    const { drive, list } = fakeDrive();
    list
      .mockResolvedValueOnce({ data: { files: [file("f1", { owners: [{ emailAddress: "x@y" }] })] } })
      .mockResolvedValueOnce({ data: {} });
    const { deps } = fakeDeps(drive);

    const result = await listDriveFiles(USER, [Q1, Q2], 20, deps);
    expect(result).toEqual({ status: "ok", files: [file("f1")] });
  });

  it("nhiều q → gọi song song (cùng signal), nối kết quả theo thứ tự queries", async () => {
    const { drive, list } = fakeDrive();
    const first = deferred<{ data: { files: unknown[] } }>();
    const second = deferred<{ data: { files: unknown[] } }>();
    list.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { deps } = fakeDeps(drive);

    const pending = listDriveFiles(USER, [Q1, Q2], 20, deps);
    await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(list.mock.calls[0]?.[0].q).toBe(Q1);
    expect(list.mock.calls[1]?.[0].q).toBe(Q2);
    expect(list.mock.calls[0]?.[1].signal).toBe(list.mock.calls[1]?.[1].signal);

    // Trả ngược thứ tự: kết quả vẫn theo thứ tự queries.
    second.resolve({ data: { files: [file("b1", { parents: ["b"] })] } });
    first.resolve({ data: { files: [file("a1"), file("a2")] } });

    await expect(pending).resolves.toEqual({
      status: "ok",
      files: [file("a1"), file("a2"), file("b1", { parents: ["b"] })],
    });
  });

  it("getDrive ném GoogleNotConnectedError → not_connected, không log", async () => {
    const { drive, list } = fakeDrive();
    const { deps, getDrive } = fakeDeps(drive);
    getDrive.mockRejectedValue(namedError("GoogleNotConnectedError"));

    await expect(listDriveFiles(USER, [Q1], 20, deps)).resolves.toEqual({ status: "not_connected" });
    expect(list).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("GoogleScopeMissingError → not_connected, không log", async () => {
    const { drive } = fakeDrive();
    const { deps, getDrive } = fakeDeps(drive);
    getDrive.mockRejectedValue(namedError("GoogleScopeMissingError"));

    await expect(listDriveFiles(USER, [Q1], 20, deps)).resolves.toEqual({ status: "not_connected" });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("lỗi gaxios mang token / URL → error, đúng một dòng log an toàn có status", async () => {
    const { drive, list } = fakeDrive();
    list.mockRejectedValue(fakeGaxiosError(500));
    const { deps } = fakeDeps(drive);

    await expect(listDriveFiles(USER, [Q1], 20, deps)).resolves.toEqual({ status: "error" });
    expectSafeSingleLog({ userId: USER, error: "GaxiosError", status: 500 });
  });

  it("một q lỗi → error, log một lần, request còn lại bị huỷ, không unhandled rejection", async () => {
    const tracker = trackUnhandledRejections();
    const { drive, list } = fakeDrive();
    const slow = deferred<never>();
    list.mockReturnValueOnce(slow.promise).mockRejectedValueOnce(fakeGaxiosError(403));
    const { deps } = fakeDeps(drive);

    await expect(listDriveFiles(USER, [Q1, Q2], 20, deps)).resolves.toEqual({ status: "error" });
    expect(list.mock.calls[0]?.[1].signal.aborted).toBe(true);

    slow.reject(namedError("AbortError"));
    await tracker.flush();

    expectSafeSingleLog({ userId: USER, error: "GaxiosError", status: 403 });
    expect(tracker.seen).toEqual([]);
  });

  it("hasDriveScope ném → error, log an toàn, không gọi getDrive", async () => {
    const { drive } = fakeDrive();
    const { deps, hasDriveScope, getDrive } = fakeDeps(drive);
    hasDriveScope.mockRejectedValue(namedError("PrismaClientKnownRequestError"));

    await expect(listDriveFiles(USER, [Q1], 20, deps)).resolves.toEqual({ status: "error" });
    expect(getDrive).not.toHaveBeenCalled();
    expectSafeSingleLog({ userId: USER, error: "PrismaClientKnownRequestError" });
  });

  it("quá hạn tổng → error, log TimeoutError, signal huỷ, dọn timer; resolve muộn bị bỏ qua", async () => {
    vi.useFakeTimers();
    const tracker = trackUnhandledRejections();
    const { drive, list } = fakeDrive();
    const late = deferred<{ data: { files: unknown[] } }>();
    list.mockReturnValue(late.promise);
    const { deps } = fakeDeps(drive);

    const pending = listDriveFiles(USER, [Q1], 20, deps);
    await vi.advanceTimersByTimeAsync(DRIVE_TOTAL_TIMEOUT_MS - 1);
    expect(errorSpy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toEqual({ status: "error" });
    expect(vi.getTimerCount()).toBe(0);
    const signal: AbortSignal = list.mock.calls[0]?.[1].signal;
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toMatchObject({ name: "TimeoutError" });

    late.resolve({ data: { files: [file("late")] } });
    await tracker.flush();

    expectSafeSingleLog({ userId: USER, error: "TimeoutError" });
    expect(tracker.seen).toEqual([]);
  });

  it("quá hạn rồi request reject AbortError / gaxios muộn → vẫn một dòng TimeoutError", async () => {
    vi.useFakeTimers();
    const tracker = trackUnhandledRejections();
    const { drive, list } = fakeDrive();
    list.mockImplementationOnce(
      (_params: unknown, options?: { signal?: AbortSignal }) =>
        new Promise((_, reject) => {
          options?.signal?.addEventListener("abort", () => reject(namedError("AbortError")));
        }),
    );
    const late = deferred<never>();
    list.mockReturnValueOnce(late.promise);
    const { deps } = fakeDeps(drive);

    const pending = listDriveFiles(USER, [Q1, Q2], 20, deps);
    await vi.advanceTimersByTimeAsync(DRIVE_TOTAL_TIMEOUT_MS);
    await expect(pending).resolves.toEqual({ status: "error" });

    late.reject(fakeGaxiosError(500));
    await tracker.flush();

    expectSafeSingleLog({ userId: USER, error: "TimeoutError" });
    expect(tracker.seen).toEqual([]);
  });

  it("getDrive resolve muộn (sau hạn) → không gọi files.list", async () => {
    vi.useFakeTimers();
    const { drive, list } = fakeDrive();
    const late = deferred<DriveFilesClient>();
    const { deps, getDrive } = fakeDeps(drive);
    getDrive.mockReturnValue(late.promise);

    const pending = listDriveFiles(USER, [Q1], 20, deps);
    await vi.advanceTimersByTimeAsync(DRIVE_TOTAL_TIMEOUT_MS);
    await expect(pending).resolves.toEqual({ status: "error" });

    late.resolve(drive);
    await vi.advanceTimersByTimeAsync(0);

    expect(list).not.toHaveBeenCalled();
    expectSafeSingleLog({ userId: USER, error: "TimeoutError" });
  });

  it("totalTimeoutMs tuỳ chỉnh được", async () => {
    vi.useFakeTimers();
    const { drive, list } = fakeDrive();
    list.mockReturnValue(new Promise(() => {}));
    const { deps } = fakeDeps(drive, { totalTimeoutMs: 50 });

    const pending = listDriveFiles(USER, [Q1], 20, deps);
    await vi.advanceTimersByTimeAsync(50);
    await expect(pending).resolves.toEqual({ status: "error" });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("listDriveFiles với defaultDeps", () => {
  it("thiếu drive.file → kiểm đúng scope, không nạp client / googleapis", async () => {
    mocks.hasGoogleScope.mockResolvedValue(false);

    await expect(listDriveFiles(USER, [Q1], 20)).resolves.toEqual({ status: "not_connected" });
    expect(mocks.hasGoogleScope).toHaveBeenCalledWith(USER, GOOGLE_SCOPES.drive);
    expect(mocks.getGoogleAuth).not.toHaveBeenCalled();
    expect(mocks.googleDrive).not.toHaveBeenCalled();
  });

  it("có scope → dùng client theo user", async () => {
    const { drive, list } = fakeDrive();
    list.mockResolvedValue({ data: { files: [file("f1")] } });
    mocks.hasGoogleScope.mockResolvedValue(true);
    mocks.getGoogleAuth.mockResolvedValue({ kind: "oauth2" });
    mocks.googleDrive.mockReturnValue(drive);

    await expect(listDriveFiles(USER, [Q1], 20)).resolves.toEqual({ status: "ok", files: [file("f1")] });
    expect(mocks.getGoogleAuth).toHaveBeenCalledWith(USER);
  });
});

describe("createDriveFile", () => {
  const PARENT = "folder-1";
  const input = (kind: DocKind = "doc") => ({ name: "Kế hoạch", kind, parentId: PARENT });

  it("không có scope → not_connected, không gọi getDrive / files.create, không log", async () => {
    const { drive, create } = fakeDrive();
    const { deps, hasDriveScope, getDrive } = fakeDeps(drive);
    hasDriveScope.mockResolvedValue(false);

    await expect(createDriveFile(USER, input(), deps)).resolves.toEqual({ status: "not_connected" });
    expect(hasDriveScope).toHaveBeenCalledWith(USER);
    expect(getDrive).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it.each<DocKind>(["doc", "sheet", "slide"])(
    "%s → files.create đúng mimeType / parents / fields, có signal, trả file đã lọc trường",
    async (kind) => {
      const { drive, create } = fakeDrive();
      const created = file("new-1", { mimeType: DOC_KIND_MIME[kind], parents: [PARENT] });
      create.mockResolvedValue({ data: { ...created, owners: [{ emailAddress: "x@y" }] } });
      const { deps, getDrive } = fakeDeps(drive);

      await expect(createDriveFile(USER, input(kind), deps)).resolves.toEqual({
        status: "ok",
        file: created,
      });
      expect(getDrive).toHaveBeenCalledWith(USER);
      expect(create).toHaveBeenCalledTimes(1);
      expect(create).toHaveBeenCalledWith(
        {
          requestBody: { name: "Kế hoạch", mimeType: DOC_KIND_MIME[kind], parents: [PARENT] },
          fields: DRIVE_FILE_CREATE_FIELDS,
        },
        { signal: expect.any(AbortSignal) },
      );
      expect(create.mock.calls[0]?.[1].signal.aborted).toBe(false);
      expect(errorSpy).not.toHaveBeenCalled();
    },
  );

  it("Drive trả không có id → error, log một dòng DriveFileMissingIdError", async () => {
    const { drive, create } = fakeDrive();
    create.mockResolvedValue({ data: { name: "Kế hoạch" } });
    const { deps } = fakeDeps(drive);

    await expect(createDriveFile(USER, input(), deps)).resolves.toEqual({ status: "error" });
    expectSafeSingleLog({ userId: USER, error: "DriveFileMissingIdError" }, CREATE_LOG);
  });

  it("lỗi gaxios mang Authorization / URL → error, log an toàn (không token / URL / message)", async () => {
    const { drive, create } = fakeDrive();
    create.mockRejectedValue(fakeGaxiosError(403));
    const { deps } = fakeDeps(drive);

    await expect(createDriveFile(USER, input("sheet"), deps)).resolves.toEqual({ status: "error" });
    expectSafeSingleLog({ userId: USER, error: "GaxiosError", status: 403 }, CREATE_LOG);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("Request failed");
  });

  it("GoogleNotConnectedError → not_connected, không log", async () => {
    const { drive, create } = fakeDrive();
    const { deps, getDrive } = fakeDeps(drive);
    getDrive.mockRejectedValue(namedError("GoogleNotConnectedError"));

    await expect(createDriveFile(USER, input(), deps)).resolves.toEqual({ status: "not_connected" });
    expect(create).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("GoogleScopeMissingError từ files.create → not_connected, không log", async () => {
    const { drive, create } = fakeDrive();
    create.mockRejectedValue(namedError("GoogleScopeMissingError"));
    const { deps } = fakeDeps(drive);

    await expect(createDriveFile(USER, input(), deps)).resolves.toEqual({ status: "not_connected" });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("quá hạn (totalTimeoutMs nhỏ) → error, log TimeoutError, signal huỷ, dọn timer", async () => {
    vi.useFakeTimers();
    const tracker = trackUnhandledRejections();
    const { drive, create } = fakeDrive();
    const late = deferred<{ data: unknown }>();
    create.mockReturnValue(late.promise);
    const { deps } = fakeDeps(drive, { totalTimeoutMs: 50 });

    const pending = createDriveFile(USER, input(), deps);
    await vi.advanceTimersByTimeAsync(49);
    expect(errorSpy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toEqual({ status: "error" });
    expect(vi.getTimerCount()).toBe(0);
    expect(create.mock.calls[0]?.[1].signal.aborted).toBe(true);

    late.resolve({ data: file("late") });
    await tracker.flush();

    expectSafeSingleLog({ userId: USER, error: "TimeoutError" }, CREATE_LOG);
    expect(tracker.seen).toEqual([]);
  });

  it("mặc định dùng hạn tổng DRIVE_TOTAL_TIMEOUT_MS", async () => {
    vi.useFakeTimers();
    const { drive, create } = fakeDrive();
    create.mockReturnValue(new Promise(() => {}));
    const { deps } = fakeDeps(drive);

    const pending = createDriveFile(USER, input(), deps);
    await vi.advanceTimersByTimeAsync(DRIVE_TOTAL_TIMEOUT_MS - 1);
    expect(errorSpy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual({ status: "error" });
  });

  it("getDrive resolve muộn (sau hạn) → không gọi files.create", async () => {
    vi.useFakeTimers();
    const { drive, create } = fakeDrive();
    const late = deferred<DriveFilesClient>();
    const { deps, getDrive } = fakeDeps(drive, { totalTimeoutMs: 50 });
    getDrive.mockReturnValue(late.promise);

    const pending = createDriveFile(USER, input(), deps);
    await vi.advanceTimersByTimeAsync(50);
    await expect(pending).resolves.toEqual({ status: "error" });

    late.resolve(drive);
    await vi.advanceTimersByTimeAsync(0);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("createDriveFile với defaultDeps", () => {
  it("thiếu drive.file → không nạp client / googleapis", async () => {
    mocks.hasGoogleScope.mockResolvedValue(false);

    await expect(
      createDriveFile(USER, { name: "A", kind: "doc", parentId: "p" }),
    ).resolves.toEqual({ status: "not_connected" });
    expect(mocks.hasGoogleScope).toHaveBeenCalledWith(USER, GOOGLE_SCOPES.drive);
    expect(mocks.getGoogleAuth).not.toHaveBeenCalled();
    expect(mocks.googleDrive).not.toHaveBeenCalled();
  });
});
