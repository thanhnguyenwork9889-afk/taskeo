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
    mocks.hasGoogleScope.mockResolvedValue(false);

    await expect(provisionSpaceFolder(USER, SPACE)).resolves.toBeNull();
    await expect(
      provisionProjectFolder(USER, { space: { ...SPACE, driveFolderId: null }, project: PROJECT }),
    ).resolves.toEqual({ spaceFolderId: null, projectFolderId: null });

    expect(mocks.hasGoogleScope).toHaveBeenCalledWith(USER, GOOGLE_SCOPES.drive);
    expect(mocks.loaded).toEqual({ googleapis: false, client: false });
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
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ q: rootFolderQuery() }));
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      requestBody: {
        name: "Marketing",
        mimeType: DRIVE_FOLDER_MIME,
        parents: ["root-1"],
        appProperties: { taskeoRole: "space", taskeoSpaceId: "space-1" },
      },
      fields: "id",
    });
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
  it("không gian đã có thư mục → không gọi list, tạo dự án dưới thư mục đó, spaceFolderId null", async () => {
    const { drive, list, create } = fakeDrive();
    create.mockResolvedValue({ data: { id: "project-folder-1" } });
    const { deps } = fakeDeps(drive);

    await expect(
      provisionProjectFolder(
        USER,
        { space: { ...SPACE, driveFolderId: "space-folder-0" }, project: PROJECT },
        deps,
      ),
    ).resolves.toEqual({ spaceFolderId: null, projectFolderId: "project-folder-1" });

    expect(list).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      requestBody: {
        name: "Ra mắt",
        mimeType: DRIVE_FOLDER_MIME,
        parents: ["space-folder-0"],
        appProperties: { taskeoRole: "project", taskeoProjectId: "project-1" },
      },
      fields: "id",
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("không gian chưa có thư mục → tạo gốc, không gian, rồi dự án; trả cả hai id", async () => {
    const { drive, list, create } = fakeDrive();
    list.mockResolvedValue({ data: { files: [] } });
    create
      .mockResolvedValueOnce({ data: { id: "root-new" } })
      .mockResolvedValueOnce({ data: { id: "space-new" } })
      .mockResolvedValueOnce({ data: { id: "project-new" } });
    const { deps } = fakeDeps(drive);

    await expect(
      provisionProjectFolder(USER, { space: { ...SPACE, driveFolderId: null }, project: PROJECT }, deps),
    ).resolves.toEqual({ spaceFolderId: "space-new", projectFolderId: "project-new" });

    expect(create).toHaveBeenCalledTimes(3);
    expect(create.mock.calls[1]?.[0].requestBody).toMatchObject({
      name: "Marketing",
      parents: ["root-new"],
      appProperties: { taskeoRole: "space", taskeoSpaceId: "space-1" },
    });
    expect(create.mock.calls[2]?.[0].requestBody).toMatchObject({
      name: "Ra mắt",
      parents: ["space-new"],
      appProperties: { taskeoRole: "project", taskeoProjectId: "project-1" },
    });
  });

  it("tạo thư mục không gian lỗi → cả hai null, log có projectId", async () => {
    const { drive, list, create } = fakeDrive();
    list.mockResolvedValue({ data: { files: [{ id: "root-1" }] } });
    create.mockRejectedValue(fakeGaxiosError(500));
    const { deps } = fakeDeps(drive);

    await expect(
      provisionProjectFolder(USER, { space: { ...SPACE, driveFolderId: null }, project: PROJECT }, deps),
    ).resolves.toEqual({ spaceFolderId: null, projectFolderId: null });
    expect(create).toHaveBeenCalledTimes(1);
    expectSafeSingleLog({
      userId: USER,
      spaceId: "space-1",
      projectId: "project-1",
      error: "GaxiosError",
      status: 500,
    });
  });

  it("thư mục không gian tạo được nhưng thư mục dự án lỗi → vẫn trả spaceFolderId", async () => {
    const { drive, list, create } = fakeDrive();
    list.mockResolvedValue({ data: { files: [{ id: "root-1" }] } });
    create
      .mockResolvedValueOnce({ data: { id: "space-new" } })
      .mockRejectedValueOnce(fakeGaxiosError(404));
    const { deps } = fakeDeps(drive);

    await expect(
      provisionProjectFolder(USER, { space: { ...SPACE, driveFolderId: null }, project: PROJECT }, deps),
    ).resolves.toEqual({ spaceFolderId: "space-new", projectFolderId: null });
    expectSafeSingleLog({
      userId: USER,
      spaceId: "space-1",
      projectId: "project-1",
      error: "GaxiosError",
      status: 404,
    });
  });

  it("không có scope → không gọi getDrive, cả hai null, không log", async () => {
    const { drive } = fakeDrive();
    const { deps, getDrive } = fakeDeps(drive);
    vi.mocked(deps.hasDriveScope).mockResolvedValue(false);

    await expect(
      provisionProjectFolder(USER, { space: { ...SPACE, driveFolderId: "sf" }, project: PROJECT }, deps),
    ).resolves.toEqual({ spaceFolderId: null, projectFolderId: null });
    expect(getDrive).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("getDrive ném GoogleNotConnectedError → cả hai null, không log", async () => {
    const { drive } = fakeDrive();
    const { deps } = fakeDeps(drive);
    vi.mocked(deps.getDrive).mockRejectedValue(namedError("GoogleNotConnectedError"));

    await expect(
      provisionProjectFolder(USER, { space: { ...SPACE, driveFolderId: null }, project: PROJECT }, deps),
    ).resolves.toEqual({ spaceFolderId: null, projectFolderId: null });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("hasDriveScope ném → cả hai null, log an toàn", async () => {
    const { drive } = fakeDrive();
    const { deps } = fakeDeps(drive);
    vi.mocked(deps.hasDriveScope).mockRejectedValue(new TypeError(`bad ${SECRET_TOKEN}`));

    await expect(
      provisionProjectFolder(USER, { space: { ...SPACE, driveFolderId: null }, project: PROJECT }, deps),
    ).resolves.toEqual({ spaceFolderId: null, projectFolderId: null });
    expectSafeSingleLog({ userId: USER, spaceId: "space-1", projectId: "project-1", error: "TypeError" });
  });

  it("tên được chuẩn hoá; tên dự án rỗng → tên mặc định", async () => {
    const { drive, list, create } = fakeDrive();
    list.mockResolvedValue({ data: { files: [{ id: "root-1" }] } });
    create
      .mockResolvedValueOnce({ data: { id: "space-new" } })
      .mockResolvedValueOnce({ data: { id: "project-new" } });
    const { deps } = fakeDeps(drive);

    await provisionProjectFolder(
      USER,
      { space: { id: "s", name: "  ", driveFolderId: null }, project: { id: "p", name: "\u0007\n" } },
      deps,
    );

    expect(create.mock.calls[0]?.[0].requestBody.name).toBe(DEFAULT_SPACE_FOLDER_NAME);
    expect(create.mock.calls[1]?.[0].requestBody.name).toBe(DEFAULT_PROJECT_FOLDER_NAME);
  });

  it("quá hạn tổng sau khi đã tạo thư mục không gian → trả spaceFolderId, log TimeoutError", async () => {
    vi.useFakeTimers();
    const { drive, list, create } = fakeDrive();
    list.mockResolvedValue({ data: { files: [{ id: "root-1" }] } });
    create
      .mockResolvedValueOnce({ data: { id: "space-new" } })
      .mockReturnValueOnce(new Promise(() => {}));
    const { deps } = fakeDeps(drive);

    const pending = provisionProjectFolder(
      USER,
      { space: { ...SPACE, driveFolderId: null }, project: PROJECT },
      deps,
    );
    await vi.advanceTimersByTimeAsync(DRIVE_TOTAL_TIMEOUT_MS);

    await expect(pending).resolves.toEqual({ spaceFolderId: "space-new", projectFolderId: null });
    expectSafeSingleLog({
      userId: USER,
      spaceId: "space-1",
      projectId: "project-1",
      error: "TimeoutError",
    });
    expect(vi.getTimerCount()).toBe(0);
  });
});
