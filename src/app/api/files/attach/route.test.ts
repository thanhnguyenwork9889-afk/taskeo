import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AttachFileResponse, DriveFileItem } from "@/domain/types";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(async () => undefined),
  getApiUserId: vi.fn(),
  attachFile: vi.fn(),
  serverModuleLoaded: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("@/server/auth/session", () => ({ getApiUserId: mocks.getApiUserId }));
// Factory đặt tên để `freshRoute` đăng ký lại bằng `vi.doMock` (xoá kết quả mock đã cache).
const serverDriveFilesModule = vi.hoisted(() => () => {
  mocks.serverModuleLoaded();
  return { attachFile: mocks.attachFile };
});

vi.mock("@/server/drive-files", serverDriveFilesModule);

import { POST } from "./route";

const DRIVE_FILE_ID = "1AbCdEfGhIjKlMnOpQrStUv";

const FILE: DriveFileItem = {
  id: "shortcut_1",
  name: "Kế hoạch",
  kind: "doc",
  url: `https://docs.google.com/document/d/${DRIVE_FILE_ID}/edit`,
  modifiedAt: "2026-11-27T08:00:00.000Z",
  spaceId: "sp_1",
  projectId: "pj_1",
  spaceName: "Công việc",
  projectName: "Website",
  shortcut: true,
};

const URL_BASE = "http://localhost/api/files/attach";
const VALID_BODY = { driveFileId: DRIVE_FILE_ID, spaceId: "sp_1" } as const;

function postRequest(body: unknown): Request {
  return new Request(URL_BASE, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/**
 * Nạp lại route với module cache sạch: factory `vi.mock("@/server/drive-files")` chạy lại nếu
 * route import `@/server/drive-files`, nên `serverModuleLoaded` phản ánh đúng lần gọi này.
 */
async function freshRoute(): Promise<typeof import("./route")> {
  vi.resetModules();
  vi.doMock("@/server/drive-files", serverDriveFilesModule);
  return import("./route");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.getApiUserId.mockResolvedValue({ ok: true, userId: "user_1" });
  mocks.attachFile.mockResolvedValue({ ok: true, file: FILE });
});

describe("POST /api/files/attach — phiên", () => {
  it("không gọi connection()", async () => {
    await POST(postRequest(VALID_BODY));
    expect(mocks.connection).not.toHaveBeenCalled();
  });

  it("trả 401 khi chưa đăng nhập, không import và không gọi hàm server", async () => {
    mocks.getApiUserId.mockResolvedValue({ ok: false, status: 401 });
    const { POST: freshPost } = await freshRoute();
    const response = await freshPost(postRequest(VALID_BODY));
    expect(response.status).toBe(401);
    expect((await response.json()).data).toBeNull();
    expect(mocks.serverModuleLoaded).not.toHaveBeenCalled();
    expect(mocks.attachFile).not.toHaveBeenCalled();
  });

  it("trả 503 ở chế độ demo và không import @/server/drive-files", async () => {
    mocks.getApiUserId.mockResolvedValue({ ok: false, status: 503 });
    const { POST: freshPost } = await freshRoute();
    const response = await freshPost(postRequest(VALID_BODY));
    expect(response.status).toBe(503);
    expect((await response.json()).data).toBeNull();
    expect(mocks.serverModuleLoaded).not.toHaveBeenCalled();
    expect(mocks.attachFile).not.toHaveBeenCalled();
  });

  it("import @/server/drive-files khi đã đăng nhập", async () => {
    const { POST: freshPost } = await freshRoute();
    const response = await freshPost(postRequest(VALID_BODY));
    expect(response.status).toBe(201);
    expect(mocks.serverModuleLoaded).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/files/attach — body", () => {
  it("trả 400 khi JSON hỏng", async () => {
    const response = await POST(postRequest("{driveFileId:"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      data: null,
      error: { message: "Dữ liệu gửi lên không phải JSON hợp lệ" },
    });
    expect(mocks.attachFile).not.toHaveBeenCalled();
  });

  it.each([
    ["thiếu driveFileId", { spaceId: "sp_1" }, "driveFileId"],
    ["driveFileId rỗng", { ...VALID_BODY, driveFileId: "" }, "driveFileId"],
    ["driveFileId có dấu /", { ...VALID_BODY, driveFileId: "1AbCdEfGh/../IjKl" }, "driveFileId"],
    ["driveFileId quá ngắn", { ...VALID_BODY, driveFileId: "abc" }, "driveFileId"],
    ["driveFileId quá dài", { ...VALID_BODY, driveFileId: "a".repeat(129) }, "driveFileId"],
    ["driveFileId không phải chuỗi", { ...VALID_BODY, driveFileId: 123 }, "driveFileId"],
    ["thiếu spaceId", { driveFileId: DRIVE_FILE_ID }, "spaceId"],
  ])("trả 400 khi %s", async (_label, body, field) => {
    const response = await POST(postRequest(body));
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.data).toBeNull();
    expect(json.error.details.fieldErrors[field]).toBeDefined();
    expect(mocks.attachFile).not.toHaveBeenCalled();
  });

  it.each([{ userId: "user_2" }, { parentId: "folder_x" }, { name: "Khác" }])(
    "trả 400 khi có khoá lạ %o",
    async (extra) => {
      const response = await POST(postRequest({ ...VALID_BODY, ...extra }));
      expect(response.status).toBe(400);
      expect((await response.json()).data).toBeNull();
      expect(mocks.attachFile).not.toHaveBeenCalled();
    },
  );

  it("truyền input đã parse: projectId rỗng bị bỏ", async () => {
    await POST(postRequest({ ...VALID_BODY, projectId: "" }));
    expect(mocks.attachFile).toHaveBeenCalledTimes(1);
    expect(mocks.attachFile).toHaveBeenCalledWith("user_1", { driveFileId: DRIVE_FILE_ID, spaceId: "sp_1" });
  });

  it("truyền projectId khi có", async () => {
    await POST(postRequest({ ...VALID_BODY, projectId: "pj_1" }));
    expect(mocks.attachFile).toHaveBeenCalledWith("user_1", {
      driveFileId: DRIVE_FILE_ID,
      spaceId: "sp_1",
      projectId: "pj_1",
    });
  });
});

describe("POST /api/files/attach — kết quả", () => {
  it("trả 201 { data: { file }, error: null }", async () => {
    const response = await POST(postRequest(VALID_BODY));
    expect(response.status).toBe(201);
    const json = (await response.json()) as { data: AttachFileResponse; error: null };
    expect(json).toEqual({ data: { file: FILE }, error: null });
  });

  it("trả 404 'Không tìm thấy không gian' không có code khi không có projectId", async () => {
    mocks.attachFile.mockResolvedValue({ ok: false, reason: "not_found" });
    const response = await POST(postRequest(VALID_BODY));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ data: null, error: { message: "Không tìm thấy không gian" } });
  });

  it("trả 404 'Không tìm thấy dự án' không có code khi có projectId", async () => {
    mocks.attachFile.mockResolvedValue({ ok: false, reason: "not_found" });
    const response = await POST(postRequest({ ...VALID_BODY, projectId: "pj_other" }));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ data: null, error: { message: "Không tìm thấy dự án" } });
  });

  it("trả 404 kèm code invalid_target khi file đích không dùng được", async () => {
    mocks.attachFile.mockResolvedValue({ ok: false, reason: "invalid_target" });
    const response = await POST(postRequest(VALID_BODY));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      data: null,
      error: {
        message: "File này không mở được bằng Taskeo hoặc không phải Google Docs / Sheets / Slides",
        code: "invalid_target",
      },
    });
  });

  it("trả 403 kèm code drive_not_connected", async () => {
    mocks.attachFile.mockResolvedValue({ ok: false, reason: "drive_not_connected" });
    const response = await POST(postRequest(VALID_BODY));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      data: null,
      error: { message: "Bạn chưa kết nối Google Drive", code: "drive_not_connected" },
    });
  });

  it("trả 409 kèm code already_attached", async () => {
    mocks.attachFile.mockResolvedValue({ ok: false, reason: "already_attached" });
    const response = await POST(postRequest(VALID_BODY));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      data: null,
      error: { message: "File này đã được gắn vào đây rồi", code: "already_attached" },
    });
  });

  it("trả 502 không có code, nhắc xem Tài liệu gần đây khi Google lỗi", async () => {
    mocks.attachFile.mockResolvedValue({ ok: false, reason: "drive_error" });
    const response = await POST(postRequest(VALID_BODY));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      data: null,
      error: {
        message:
          "Không gắn được file từ Google Drive. File có thể đã được gắn — hãy xem Tài liệu gần đây trước khi thử lại.",
      },
    });
  });

  it("trả 500 thông báo chung khi hàm server ném, không lộ message", async () => {
    mocks.attachFile.mockRejectedValue(new Error("PrismaClientKnownRequestError: secret table"));
    const response = await POST(postRequest(VALID_BODY));
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain("Prisma");
    expect(text).not.toContain("secret");
    expect(JSON.parse(text).data).toBeNull();
    expect(console.error).toHaveBeenCalledWith("POST /api/files/attach", expect.anything());
  });
});
