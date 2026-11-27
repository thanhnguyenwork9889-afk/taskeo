import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateFileResponse, DriveFileItem } from "@/domain/types";
import { SPACE_NAME_MAX } from "@/domain/validation";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(async () => undefined),
  getApiUserId: vi.fn(),
  listFiles: vi.fn(),
  createFile: vi.fn(),
  serverModuleLoaded: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("@/server/auth/session", () => ({ getApiUserId: mocks.getApiUserId }));
// Factory đặt tên để `freshRoute` đăng ký lại bằng `vi.doMock` (xoá kết quả mock đã cache).
const serverDriveFilesModule = vi.hoisted(() => () => {
  mocks.serverModuleLoaded();
  return { listFiles: mocks.listFiles, createFile: mocks.createFile };
});

vi.mock("@/server/drive-files", serverDriveFilesModule);

import { GET, POST } from "./route";

const FILE: DriveFileItem = {
  id: "file_1",
  name: "Kế hoạch",
  kind: "doc",
  url: "https://docs.google.com/document/d/file_1/edit",
  modifiedAt: "2026-11-26T08:00:00.000Z",
  spaceId: "sp_1",
  projectId: "pj_1",
  spaceName: "Công việc",
  projectName: "Website",
};

const URL_BASE = "http://localhost/api/files";

function getRequest(query = ""): Request {
  return new Request(`${URL_BASE}${query}`);
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
  mocks.listFiles.mockResolvedValue({ ok: true, files: [] });
  mocks.createFile.mockResolvedValue({ ok: true, file: FILE });
});

describe("GET /api/files — phiên", () => {
  it("chờ connection() trước khi đọc phiên", async () => {
    await GET(getRequest());
    expect(mocks.connection).toHaveBeenCalledTimes(1);
  });

  it("trả 401 khi chưa đăng nhập, không import và không gọi hàm server", async () => {
    mocks.getApiUserId.mockResolvedValue({ ok: false, status: 401 });
    const { GET: freshGet } = await freshRoute();
    const response = await freshGet(getRequest());
    expect(response.status).toBe(401);
    expect((await response.json()).data).toBeNull();
    expect(mocks.serverModuleLoaded).not.toHaveBeenCalled();
    expect(mocks.listFiles).not.toHaveBeenCalled();
  });

  it("trả 503 ở chế độ demo và không import @/server/drive-files", async () => {
    mocks.getApiUserId.mockResolvedValue({ ok: false, status: 503 });
    const { GET: freshGet } = await freshRoute();
    const response = await freshGet(getRequest());
    expect(response.status).toBe(503);
    expect((await response.json()).data).toBeNull();
    expect(mocks.serverModuleLoaded).not.toHaveBeenCalled();
    expect(mocks.listFiles).not.toHaveBeenCalled();
  });
});

describe("GET /api/files — query", () => {
  it.each(["0", "101", "1.5", "-1", "abc", "1e2"])("trả 400 khi limit=%s", async (limit) => {
    const response = await GET(getRequest(`?limit=${limit}`));
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.data).toBeNull();
    expect(json.error.details.fieldErrors.limit).toBeDefined();
    expect(mocks.listFiles).not.toHaveBeenCalled();
  });

  it.each(["pdf", "DOC", "folder"])("trả 400 khi kind=%s", async (kind) => {
    const response = await GET(getRequest(`?kind=${kind}`));
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.data).toBeNull();
    expect(json.error.details.fieldErrors.kind).toBeDefined();
    expect(mocks.listFiles).not.toHaveBeenCalled();
  });

  it("trả 400 khi gửi cả spaceId và projectId", async () => {
    const response = await GET(getRequest("?spaceId=sp_1&projectId=pj_1"));
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.data).toBeNull();
    expect(json.error.details.fieldErrors.projectId).toBeDefined();
    expect(mocks.listFiles).not.toHaveBeenCalled();
  });

  it.each(["limit=1&limit=2", "spaceId=a&spaceId=b", "projectId=a&projectId=b", "kind=doc&kind=sheet"])(
    "trả 400 nêu key khi gửi lặp (%s)",
    async (query) => {
      const response = await GET(getRequest(`?${query}`));
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.data).toBeNull();
      expect(json.error.message).toContain(query.split("=")[0]);
      expect(mocks.listFiles).not.toHaveBeenCalled();
    },
  );

  it("dùng limit mặc định 20, không lọc khi không gửi gì", async () => {
    const response = await GET(getRequest());
    expect(response.status).toBe(200);
    expect(mocks.listFiles).toHaveBeenCalledWith("user_1", { limit: 20 });
  });

  it("coi tham số rỗng như không gửi", async () => {
    await GET(getRequest("?spaceId=&projectId=&kind=&limit="));
    expect(mocks.listFiles).toHaveBeenCalledWith("user_1", { limit: 20 });
  });

  it("truyền spaceId / kind / limit đã parse cho hàm server", async () => {
    await GET(getRequest("?spaceId=sp_1&kind=sheet&limit=100"));
    expect(mocks.listFiles).toHaveBeenCalledWith("user_1", { spaceId: "sp_1", kind: "sheet", limit: 100 });
  });

  it("truyền projectId cho hàm server, bỏ qua key lạ (kể cả userId)", async () => {
    await GET(getRequest("?projectId=pj_1&userId=user_2&foo=a&foo=b"));
    expect(mocks.listFiles).toHaveBeenCalledWith("user_1", { projectId: "pj_1", limit: 20 });
  });
});

describe("GET /api/files — kết quả", () => {
  it("trả 200 { data: { files }, error: null } đủ 9 trường", async () => {
    mocks.listFiles.mockResolvedValue({ ok: true, files: [FILE] });
    const response = await GET(getRequest());
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ data: { files: [FILE] }, error: null });
    expect(Object.keys(json.data.files[0]).sort()).toEqual([
      "id",
      "kind",
      "modifiedAt",
      "name",
      "projectId",
      "projectName",
      "spaceId",
      "spaceName",
      "url",
    ]);
  });

  it("trả 404 'Không tìm thấy không gian' khi spaceId không thuộc user", async () => {
    mocks.listFiles.mockResolvedValue({ ok: false, reason: "not_found" });
    const response = await GET(getRequest("?spaceId=sp_other"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ data: null, error: { message: "Không tìm thấy không gian" } });
  });

  it("trả 404 'Không tìm thấy dự án' khi projectId không thuộc user", async () => {
    mocks.listFiles.mockResolvedValue({ ok: false, reason: "not_found" });
    const response = await GET(getRequest("?projectId=pj_other"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ data: null, error: { message: "Không tìm thấy dự án" } });
  });

  it("trả 403 kèm code drive_not_connected khi chưa kết nối Drive", async () => {
    mocks.listFiles.mockResolvedValue({ ok: false, reason: "drive_not_connected" });
    const response = await GET(getRequest());
    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json.data).toBeNull();
    expect(json.error.code).toBe("drive_not_connected");
    expect(json.error.message).toBe("Bạn chưa kết nối Google Drive");
  });

  it("trả 502 thông báo chung khi Google lỗi, không có code", async () => {
    mocks.listFiles.mockResolvedValue({ ok: false, reason: "drive_error" });
    const response = await GET(getRequest("?spaceId=sp_1"));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      data: null,
      error: { message: "Không tải được tài liệu từ Google Drive, vui lòng thử lại sau" },
    });
  });

  it("trả 500 thông báo chung khi DB lỗi, không lộ message", async () => {
    mocks.listFiles.mockRejectedValue(new Error("PrismaClientKnownRequestError: secret table"));
    const response = await GET(getRequest());
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain("Prisma");
    expect(text).not.toContain("secret");
    expect(JSON.parse(text).data).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });
});

const VALID_BODY = { name: "Kế hoạch", kind: "doc", spaceId: "sp_1" } as const;

function postRequest(body: unknown): Request {
  return new Request(URL_BASE, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/files — phiên", () => {
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
    expect(mocks.createFile).not.toHaveBeenCalled();
  });

  it("trả 503 ở chế độ demo và không import @/server/drive-files", async () => {
    mocks.getApiUserId.mockResolvedValue({ ok: false, status: 503 });
    const { POST: freshPost } = await freshRoute();
    const response = await freshPost(postRequest(VALID_BODY));
    expect(response.status).toBe(503);
    expect((await response.json()).data).toBeNull();
    expect(mocks.serverModuleLoaded).not.toHaveBeenCalled();
    expect(mocks.createFile).not.toHaveBeenCalled();
  });
});

describe("POST /api/files — body", () => {
  it("trả 400 khi JSON hỏng", async () => {
    const response = await POST(postRequest("{name:"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      data: null,
      error: { message: "Dữ liệu gửi lên không phải JSON hợp lệ" },
    });
    expect(mocks.createFile).not.toHaveBeenCalled();
  });

  it.each([
    ["thiếu tên", { kind: "doc", spaceId: "sp_1" }, "name"],
    ["tên chỉ khoảng trắng", { ...VALID_BODY, name: "   " }, "name"],
    ["tên quá dài", { ...VALID_BODY, name: "a".repeat(SPACE_NAME_MAX + 1) }, "name"],
    ["kind sai", { ...VALID_BODY, kind: "pdf" }, "kind"],
    ["thiếu spaceId", { name: "Kế hoạch", kind: "doc" }, "spaceId"],
  ])("trả 400 khi %s", async (_label, body, field) => {
    const response = await POST(postRequest(body));
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.data).toBeNull();
    expect(json.error.details.fieldErrors[field]).toBeDefined();
    expect(mocks.createFile).not.toHaveBeenCalled();
  });

  it.each([{ userId: "user_2" }, { driveFolderId: "folder_x" }])("trả 400 khi có khoá lạ %o", async (extra) => {
    const response = await POST(postRequest({ ...VALID_BODY, ...extra }));
    expect(response.status).toBe(400);
    expect((await response.json()).data).toBeNull();
    expect(mocks.createFile).not.toHaveBeenCalled();
  });

  it("truyền input đã parse: tên đã trim, projectId rỗng bị bỏ", async () => {
    await POST(postRequest({ name: "  Kế hoạch  ", kind: "sheet", spaceId: "sp_1", projectId: "" }));
    expect(mocks.createFile).toHaveBeenCalledTimes(1);
    expect(mocks.createFile).toHaveBeenCalledWith("user_1", { name: "Kế hoạch", kind: "sheet", spaceId: "sp_1" });
  });

  it("truyền projectId khi có", async () => {
    await POST(postRequest({ ...VALID_BODY, kind: "slide", projectId: "pj_1" }));
    expect(mocks.createFile).toHaveBeenCalledWith("user_1", {
      name: "Kế hoạch",
      kind: "slide",
      spaceId: "sp_1",
      projectId: "pj_1",
    });
  });
});

describe("POST /api/files — kết quả", () => {
  it("trả 201 { data: { file }, error: null }", async () => {
    const response = await POST(postRequest(VALID_BODY));
    expect(response.status).toBe(201);
    const json = (await response.json()) as { data: CreateFileResponse; error: null };
    expect(json).toEqual({ data: { file: FILE }, error: null });
  });

  it("trả 404 'Không tìm thấy không gian' khi không có projectId", async () => {
    mocks.createFile.mockResolvedValue({ ok: false, reason: "not_found" });
    const response = await POST(postRequest(VALID_BODY));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ data: null, error: { message: "Không tìm thấy không gian" } });
  });

  it("trả 404 'Không tìm thấy dự án' khi có projectId", async () => {
    mocks.createFile.mockResolvedValue({ ok: false, reason: "not_found" });
    const response = await POST(postRequest({ ...VALID_BODY, projectId: "pj_other" }));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ data: null, error: { message: "Không tìm thấy dự án" } });
  });

  it("trả 403 kèm code drive_not_connected", async () => {
    mocks.createFile.mockResolvedValue({ ok: false, reason: "drive_not_connected" });
    const response = await POST(postRequest(VALID_BODY));
    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json.data).toBeNull();
    expect(json.error.code).toBe("drive_not_connected");
    expect(json.error.message).toBe("Bạn chưa kết nối Google Drive");
  });

  it("trả 502 thông báo tạo tài liệu khi Google lỗi, không có code", async () => {
    mocks.createFile.mockResolvedValue({ ok: false, reason: "drive_error" });
    const response = await POST(postRequest(VALID_BODY));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      data: null,
      error: { message: "Không tạo được tài liệu trên Google Drive, vui lòng thử lại" },
    });
  });

  it("trả 500 thông báo chung khi hàm server ném, không lộ message", async () => {
    mocks.createFile.mockRejectedValue(new Error("PrismaClientKnownRequestError: secret table"));
    const response = await POST(postRequest(VALID_BODY));
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain("Prisma");
    expect(text).not.toContain("secret");
    expect(JSON.parse(text).data).toBeNull();
    expect(console.error).toHaveBeenCalledWith("POST /api/files", expect.anything());
  });
});
