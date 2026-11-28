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

import {
  DOC_KIND_MIME,
  DRIVE_SHORTCUT_CREATE_FIELDS,
  DRIVE_SHORTCUT_MIME,
  DRIVE_TARGET_FIELDS,
  SHORTCUT_KIND_PROPERTY,
  buildShortcutLookupQuery,
} from "@/domain/drive-files";
import type { DocKind } from "@/domain/types";

import { DRIVE_TOTAL_TIMEOUT_MS, type DriveProvisionDeps } from "./drive-provision";
import { attachDriveShortcut } from "./drive-shortcuts";
import { GOOGLE_SCOPES } from "./scopes";

const USER = "user-1";
const TARGET = "target_file_id_123";
const PARENT = "parent_folder_id_456";
const SECRET_TOKEN = "ya29.SECRET-ACCESS-TOKEN";
const SECRET_URL = "https://www.googleapis.com/drive/v3/files?access_token=leak";
const SECRET_NAME = "Bí mật lương thưởng";

const LOG = "[google/drive] Không gắn được lối tắt Drive";
const FORBIDDEN_LOG = "[google/drive] Không đọc được file đích (403, kiểm tra appId Google Picker)";

function target(extra: Record<string, unknown> = {}) {
  return {
    id: TARGET,
    name: "  Kế   hoạch  ",
    mimeType: DOC_KIND_MIME.doc,
    trashed: false,
    parents: ["somewhere_else"],
    ...extra,
  };
}

function created(extra: Record<string, unknown> = {}) {
  return {
    id: "shortcut_id_789",
    name: "Kế hoạch",
    mimeType: DRIVE_SHORTCUT_MIME,
    modifiedTime: "2026-11-27T10:00:00.000Z",
    webViewLink: "https://drive.google.com/file/d/shortcut_id_789/view",
    parents: [PARENT],
    shortcutDetails: { targetId: TARGET, targetMimeType: DOC_KIND_MIME.doc },
    ...extra,
  };
}

function fakeDrive() {
  const get = vi.fn().mockResolvedValue({ data: target() });
  const list = vi.fn().mockResolvedValue({ data: { files: [] } });
  const create = vi.fn().mockResolvedValue({ data: created() });
  const drive = { files: { get, list, create } } as unknown as DriveFilesClient;
  return { drive, get, list, create };
}

function fakeDeps(drive: DriveFilesClient, overrides: Partial<DriveProvisionDeps> = {}) {
  const hasDriveScope = vi.fn<DriveProvisionDeps["hasDriveScope"]>().mockResolvedValue(true);
  const getDrive = vi.fn<DriveProvisionDeps["getDrive"]>().mockResolvedValue(drive);
  const deps: DriveProvisionDeps = { hasDriveScope, getDrive, ...overrides };
  return { deps, hasDriveScope, getDrive };
}

function namedError(name: string): Error {
  const error = new Error(`chi tiết nội bộ ${SECRET_TOKEN}`);
  error.name = name;
  return error;
}

function fakeGaxiosError(status: number, reason?: string) {
  const error = new Error(`Request failed: Bearer ${SECRET_TOKEN} ${SECRET_URL} ${SECRET_NAME}`);
  const errors = reason === undefined ? undefined : [{ reason, message: `${SECRET_TOKEN} ${SECRET_NAME}` }];
  return Object.assign(error, {
    status,
    config: { url: SECRET_URL, headers: { Authorization: `Bearer ${SECRET_TOKEN}` } },
    response: { status, data: { error: { message: `${SECRET_TOKEN} ${SECRET_NAME}`, ...(errors && { errors }) } } },
  });
}

const input = { targetId: TARGET, parentId: PARENT };

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

function expectSafeSingleLog(expected: Record<string, unknown>, expectedMessage = LOG) {
  expect(errorSpy).toHaveBeenCalledTimes(1);
  const [message, fields] = errorSpy.mock.calls[0] as [string, Record<string, unknown>];
  expect(message).toBe(expectedMessage);
  expect(fields).toEqual(expected);
  const json = JSON.stringify(errorSpy.mock.calls);
  for (const secret of [SECRET_TOKEN, "googleapis.com", "Bearer", "access_token", SECRET_NAME, "Request failed"]) {
    expect(json).not.toContain(secret);
  }
}

describe("attachDriveShortcut — kết nối", () => {
  it("không có scope → not_connected, không gọi getDrive, không log", async () => {
    const { drive, get } = fakeDrive();
    const { deps, hasDriveScope, getDrive } = fakeDeps(drive);
    hasDriveScope.mockResolvedValue(false);

    await expect(attachDriveShortcut(USER, input, deps)).resolves.toEqual({ status: "not_connected" });
    expect(hasDriveScope).toHaveBeenCalledWith(USER);
    expect(getDrive).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("deps mặc định, không có scope → không nạp client / googleapis", async () => {
    mocks.hasGoogleScope.mockResolvedValue(false);

    await expect(attachDriveShortcut(USER, input)).resolves.toEqual({ status: "not_connected" });
    expect(mocks.hasGoogleScope).toHaveBeenCalledWith(USER, GOOGLE_SCOPES.drive);
    expect(mocks.getGoogleAuth).not.toHaveBeenCalled();
    expect(mocks.googleDrive).not.toHaveBeenCalled();
  });

  it.each(["GoogleNotConnectedError", "GoogleScopeMissingError"])("%s → not_connected, không log", async (name) => {
    const { drive, get } = fakeDrive();
    const { deps, getDrive } = fakeDeps(drive);
    getDrive.mockRejectedValue(namedError(name));

    await expect(attachDriveShortcut(USER, input, deps)).resolves.toEqual({ status: "not_connected" });
    expect(get).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe("attachDriveShortcut — tạo lối tắt", () => {
  it.each<DocKind>(["doc", "sheet", "slide"])("đích %s hợp lệ → ok, tham số get / list / create đúng", async (kind) => {
    const { drive, get, list, create } = fakeDrive();
    get.mockResolvedValue({ data: target({ mimeType: DOC_KIND_MIME[kind] }) });
    const { deps } = fakeDeps(drive);

    const result = await attachDriveShortcut(USER, input, deps);

    expect(result).toEqual({ status: "ok", file: created() });
    expect(get).toHaveBeenCalledWith(
      { fileId: TARGET, fields: DRIVE_TARGET_FIELDS },
      { signal: expect.any(AbortSignal) },
    );
    expect(list).toHaveBeenCalledWith(
      { q: buildShortcutLookupQuery(TARGET), pageSize: 100, fields: "files(id,parents)", spaces: "drive" },
      { signal: expect.any(AbortSignal) },
    );
    expect(create).toHaveBeenCalledWith(
      {
        requestBody: {
          name: "Kế hoạch",
          mimeType: DRIVE_SHORTCUT_MIME,
          parents: [PARENT],
          shortcutDetails: { targetId: TARGET },
          appProperties: { [SHORTCUT_KIND_PROPERTY]: kind },
        },
        fields: DRIVE_SHORTCUT_CREATE_FIELDS,
      },
      { signal: expect.any(AbortSignal) },
    );
    expect(create.mock.calls[0]?.[1].signal.aborted).toBe(false);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("đích không có tên → tên mặc định", async () => {
    const { drive, get, create } = fakeDrive();
    get.mockResolvedValue({ data: target({ name: undefined }) });
    const { deps } = fakeDeps(drive);

    await attachDriveShortcut(USER, input, deps);
    expect(create.mock.calls[0]?.[0].requestBody.name).toBe("Tài liệu không tên");
  });

  it("chỉ trả các trường đã xin (bỏ trường thừa)", async () => {
    const { drive, create } = fakeDrive();
    create.mockResolvedValue({ data: { ...created(), size: "123", owners: [{ emailAddress: "x@y.z" }] } });
    const { deps } = fakeDeps(drive);

    await expect(attachDriveShortcut(USER, input, deps)).resolves.toEqual({ status: "ok", file: created() });
  });

  it("Drive trả không có id → error, log DriveShortcutMissingIdError", async () => {
    const { drive, create } = fakeDrive();
    create.mockResolvedValue({ data: created({ id: undefined }) });
    const { deps } = fakeDeps(drive);

    await expect(attachDriveShortcut(USER, input, deps)).resolves.toEqual({ status: "error" });
    expectSafeSingleLog({ userId: USER, error: "DriveShortcutMissingIdError", step: "create" });
  });

  it("create lỗi gaxios mang Authorization / URL → error, log sạch", async () => {
    const { drive, create } = fakeDrive();
    create.mockRejectedValue(fakeGaxiosError(500));
    const { deps } = fakeDeps(drive);

    await expect(attachDriveShortcut(USER, input, deps)).resolves.toEqual({ status: "error" });
    expectSafeSingleLog({ userId: USER, error: "GaxiosError", status: 500, step: "create" });
  });
});

describe("attachDriveShortcut — đích không hợp lệ", () => {
  it.each([
    ["thư mục", { mimeType: "application/vnd.google-apps.folder" }],
    ["PDF", { mimeType: "application/pdf" }],
    ["lối tắt", { mimeType: DRIVE_SHORTCUT_MIME }],
    ["thiếu mimeType", { mimeType: undefined }],
    ["đã vào thùng rác", { trashed: true }],
  ])("đích %s → invalid_target, không list / create, không log", async (_label, extra) => {
    const { drive, get, list, create } = fakeDrive();
    get.mockResolvedValue({ data: target(extra) });
    const { deps } = fakeDeps(drive);

    await expect(attachDriveShortcut(USER, input, deps)).resolves.toEqual({ status: "invalid_target" });
    expect(list).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("get 404 → invalid_target, không create, không log", async () => {
    const { drive, get, create } = fakeDrive();
    get.mockRejectedValue(fakeGaxiosError(404));
    const { deps } = fakeDeps(drive);

    await expect(attachDriveShortcut(USER, input, deps)).resolves.toEqual({ status: "invalid_target" });
    expect(create).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("get 403 → invalid_target, không create, log một dòng sạch gợi ý appId", async () => {
    const { drive, get, list, create } = fakeDrive();
    get.mockRejectedValue(fakeGaxiosError(403));
    const { deps } = fakeDeps(drive);

    await expect(attachDriveShortcut(USER, input, deps)).resolves.toEqual({ status: "invalid_target" });
    expect(list).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expectSafeSingleLog({ userId: USER, error: "GaxiosError", status: 403 }, FORBIDDEN_LOG);
  });

  it.each(["insufficientFilePermissions", "appNotAuthorizedToFile", "forbidden"])(
    "get 403 reason %s → invalid_target, không create, log gợi ý appId kèm reason",
    async (reason) => {
      const { drive, get, list, create } = fakeDrive();
      get.mockRejectedValue(fakeGaxiosError(403, reason));
      const { deps } = fakeDeps(drive);

      await expect(attachDriveShortcut(USER, input, deps)).resolves.toEqual({ status: "invalid_target" });
      expect(list).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
      expectSafeSingleLog({ userId: USER, error: "GaxiosError", status: 403, reason }, FORBIDDEN_LOG);
    },
  );

  it("get 403 reason lạ (ngoài danh sách) → invalid_target, không log reason", async () => {
    const { drive, get } = fakeDrive();
    get.mockRejectedValue(fakeGaxiosError(403, `weird ${SECRET_TOKEN}`));
    const { deps } = fakeDeps(drive);

    await expect(attachDriveShortcut(USER, input, deps)).resolves.toEqual({ status: "invalid_target" });
    expectSafeSingleLog({ userId: USER, error: "GaxiosError", status: 403 }, FORBIDDEN_LOG);
  });

  it.each(["userRateLimitExceeded", "rateLimitExceeded", "dailyLimitExceeded", "quotaExceeded"])(
    "get 403 reason %s → error, không list / create, log lỗi thường kèm reason",
    async (reason) => {
      const { drive, get, list, create } = fakeDrive();
      get.mockRejectedValue(fakeGaxiosError(403, reason));
      const { deps } = fakeDeps(drive);

      await expect(attachDriveShortcut(USER, input, deps)).resolves.toEqual({ status: "error" });
      expect(list).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
      expectSafeSingleLog({ userId: USER, error: "GaxiosError", status: 403, reason, step: "get" });
    },
  );

  it("get 500 → error, log sạch", async () => {
    const { drive, get, create } = fakeDrive();
    get.mockRejectedValue(fakeGaxiosError(500));
    const { deps } = fakeDeps(drive);

    await expect(attachDriveShortcut(USER, input, deps)).resolves.toEqual({ status: "error" });
    expect(create).not.toHaveBeenCalled();
    expectSafeSingleLog({ userId: USER, error: "GaxiosError", status: 500, step: "get" });
  });

  it("lỗi không phải gaxios có status 404 không bị coi là invalid_target", async () => {
    const { drive, get } = fakeDrive();
    get.mockRejectedValue(Object.assign(namedError("TypeError"), { status: 404 }));
    const { deps } = fakeDeps(drive);

    await expect(attachDriveShortcut(USER, input, deps)).resolves.toEqual({ status: "error" });
    expectSafeSingleLog({ userId: USER, error: "TypeError", step: "get" });
  });
});

describe("attachDriveShortcut — đã gắn", () => {
  it("đích đã nằm trong thư mục → already_attached, không list / create", async () => {
    const { drive, get, list, create } = fakeDrive();
    get.mockResolvedValue({ data: target({ parents: ["x", PARENT] }) });
    const { deps } = fakeDeps(drive);

    await expect(attachDriveShortcut(USER, input, deps)).resolves.toEqual({ status: "already_attached" });
    expect(list).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("đã có lối tắt trong thư mục → already_attached, không create", async () => {
    const { drive, list, create } = fakeDrive();
    list.mockResolvedValue({
      data: { files: [{ id: "elsewhere", parents: ["other"] }, { id: "existing_shortcut", parents: ["x", PARENT] }] },
    });
    const { deps } = fakeDeps(drive);

    await expect(attachDriveShortcut(USER, input, deps)).resolves.toEqual({ status: "already_attached" });
    expect(create).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("lookup: q không gộp `in parents` (Drive trả 400), lọc thư mục cha trong code", async () => {
    const { drive, list } = fakeDrive();
    const { deps } = fakeDeps(drive);

    await attachDriveShortcut(USER, input, deps);
    expect(list).toHaveBeenCalledTimes(1);
    const params = list.mock.calls[0]?.[0] as { q: string; fields: string; pageSize: number };
    expect(params.q).toBe(buildShortcutLookupQuery(TARGET));
    expect(params.q).not.toContain("in parents");
    expect(params.fields).toBe("files(id,parents)");
    expect(params.pageSize).toBe(100);
  });

  it.each([
    ["ở thư mục khác", [{ id: "s1", parents: ["other_folder"] }]],
    ["không có parents", [{ id: "s1" }]],
  ])("lối tắt tới đích %s → không already_attached, vẫn create", async (_label, files) => {
    const { drive, list, create } = fakeDrive();
    list.mockResolvedValue({ data: { files } });
    const { deps } = fakeDeps(drive);

    await expect(attachDriveShortcut(USER, input, deps)).resolves.toEqual({ status: "ok", file: created() });
    expect(create).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("lookup 400 invalid → error, không create, log step lookup + reason, không message / token", async () => {
    const { drive, list, create } = fakeDrive();
    list.mockRejectedValue(fakeGaxiosError(400, "invalid"));
    const { deps } = fakeDeps(drive);

    await expect(attachDriveShortcut(USER, input, deps)).resolves.toEqual({ status: "error" });
    expect(create).not.toHaveBeenCalled();
    expectSafeSingleLog({ userId: USER, error: "GaxiosError", status: 400, reason: "invalid", step: "lookup" });
  });

  it("list lỗi → error, không create, log sạch", async () => {
    const { drive, list, create } = fakeDrive();
    list.mockRejectedValue(fakeGaxiosError(429));
    const { deps } = fakeDeps(drive);

    await expect(attachDriveShortcut(USER, input, deps)).resolves.toEqual({ status: "error" });
    expect(create).not.toHaveBeenCalled();
    expectSafeSingleLog({ userId: USER, error: "GaxiosError", status: 429, step: "lookup" });
  });
});

describe("attachDriveShortcut — lỗi khác", () => {
  it("hasDriveScope ném → error, log an toàn, không gọi getDrive", async () => {
    const { drive } = fakeDrive();
    const { deps, hasDriveScope, getDrive } = fakeDeps(drive);
    hasDriveScope.mockRejectedValue(namedError("PrismaClientKnownRequestError"));

    await expect(attachDriveShortcut(USER, input, deps)).resolves.toEqual({ status: "error" });
    expect(getDrive).not.toHaveBeenCalled();
    expectSafeSingleLog({ userId: USER, error: "PrismaClientKnownRequestError" });
  });

  it("quá hạn tổng → error, log TimeoutError, signal huỷ, không create", async () => {
    vi.useFakeTimers();
    const { drive, get, create } = fakeDrive();
    get.mockReturnValue(new Promise(() => {}));
    const { deps } = fakeDeps(drive);

    const pending = attachDriveShortcut(USER, input, deps);
    await vi.advanceTimersByTimeAsync(DRIVE_TOTAL_TIMEOUT_MS - 1);
    expect(errorSpy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toEqual({ status: "error" });
    const signal = get.mock.calls[0]?.[1].signal as AbortSignal;
    expect(signal.aborted).toBe(true);
    expect(create).not.toHaveBeenCalled();
    expectSafeSingleLog({ userId: USER, error: "TimeoutError", step: "get" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("quá hạn khi get reject AbortError muộn → vẫn error TimeoutError, không invalid_target", async () => {
    vi.useFakeTimers();
    const { drive, get } = fakeDrive();
    get.mockImplementation(
      (_params: unknown, { signal }: { signal: AbortSignal }) =>
        new Promise((_, reject) => signal.addEventListener("abort", () => reject(namedError("AbortError")))),
    );
    const { deps } = fakeDeps(drive, { totalTimeoutMs: 50 });

    const pending = attachDriveShortcut(USER, input, deps);
    await vi.advanceTimersByTimeAsync(50);

    await expect(pending).resolves.toEqual({ status: "error" });
    expectSafeSingleLog({ userId: USER, error: "TimeoutError", step: "get" });
  });
});
