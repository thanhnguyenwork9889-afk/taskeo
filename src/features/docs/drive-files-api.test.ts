import { afterEach, describe, expect, it, vi } from "vitest";
import type { DriveFileItem } from "@/domain/types";
import { DRIVE_NOT_CONNECTED_CODE } from "@/domain/drive-files";
import { ApiRequestError, driveFilesUrl, fetchDriveFiles, shouldRetryDriveFiles } from "./drive-files-api";

const FILE: DriveFileItem = {
  id: "f1",
  name: "Kế hoạch",
  kind: "doc",
  url: "https://docs.google.com/document/d/f1/edit",
  modifiedAt: "2026-11-27T08:00:00.000Z",
  spaceId: "s1",
  projectId: null,
  spaceName: "Cá nhân",
  projectName: null,
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
});

async function rejection(promise: Promise<unknown>): Promise<ApiRequestError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ApiRequestError);
    return error as ApiRequestError;
  }
  throw new Error("expected rejection");
}

describe("driveFilesUrl", () => {
  it("không tham số → /api/files", () => {
    expect(driveFilesUrl({})).toBe("/api/files");
  });

  it("giữ thứ tự cố định spaceId, projectId, kind, limit bất kể thứ tự truyền vào", () => {
    expect(driveFilesUrl({ limit: 4, kind: "sheet", projectId: "p1" })).toBe("/api/files?projectId=p1&kind=sheet&limit=4");
    expect(driveFilesUrl({ kind: "doc", spaceId: "s1" })).toBe("/api/files?spaceId=s1&kind=doc");
  });

  it("bỏ tham số rỗng / khoảng trắng / undefined", () => {
    expect(driveFilesUrl({ spaceId: "", projectId: "   ", kind: undefined, limit: undefined })).toBe("/api/files");
  });

  it("thoát ký tự đặc biệt trong id", () => {
    expect(driveFilesUrl({ spaceId: "a&b=c" })).toBe("/api/files?spaceId=a%26b%3Dc");
  });
});

describe("fetchDriveFiles", () => {
  it("200 → trả danh sách file, gọi đúng URL và truyền signal", async () => {
    const fake = stubFetch(jsonResponse({ data: { files: [FILE] }, error: null }));
    const controller = new AbortController();
    await expect(fetchDriveFiles({ spaceId: "s1", limit: 4 }, controller.signal)).resolves.toEqual([FILE]);
    expect(fake).toHaveBeenCalledWith("/api/files?spaceId=s1&limit=4", expect.objectContaining({ signal: controller.signal }));
  });

  it("200 với danh sách rỗng → []", async () => {
    stubFetch(jsonResponse({ data: { files: [] }, error: null }));
    await expect(fetchDriveFiles({})).resolves.toEqual([]);
  });

  it("403 kèm code drive_not_connected → ApiRequestError mang status, code, message", async () => {
    stubFetch(jsonResponse({ data: null, error: { message: "Chưa kết nối Drive", code: DRIVE_NOT_CONNECTED_CODE } }, 403));
    const error = await rejection(fetchDriveFiles({}));
    expect(error.status).toBe(403);
    expect(error.code).toBe(DRIVE_NOT_CONNECTED_CODE);
    expect(error.message).toBe("Chưa kết nối Drive");
  });

  it("502 không có code → ApiRequestError status 502, code undefined", async () => {
    stubFetch(jsonResponse({ data: null, error: { message: "Google lỗi" } }, 502));
    const error = await rejection(fetchDriveFiles({}));
    expect(error.status).toBe(502);
    expect(error.code).toBeUndefined();
  });

  it("lỗi với body không phải JSON → ApiRequestError giữ status, có thông điệp mặc định", async () => {
    stubFetch(new Response("<html>Bad gateway</html>", { status: 502 }));
    const error = await rejection(fetchDriveFiles({}));
    expect(error.status).toBe(502);
    expect(error.message.length).toBeGreaterThan(0);
  });

  it("200 nhưng JSON hỏng → ApiRequestError", async () => {
    stubFetch(new Response("{not json", { status: 200 }));
    const error = await rejection(fetchDriveFiles({}));
    expect(error.status).toBe(200);
  });

  it.each([
    ["data null", { data: null, error: null }],
    ["files không phải mảng", { data: { files: "x" }, error: null }],
    ["file thiếu id", { data: { files: [{ ...FILE, id: undefined }] }, error: null }],
    ["kind lạ", { data: { files: [{ ...FILE, kind: "pdf" }] }, error: null }],
    ["không phải object", ["x"]],
  ])("200 sai hình dạng (%s) → ApiRequestError", async (_label, body) => {
    stubFetch(jsonResponse(body));
    await rejection(fetchDriveFiles({}));
  });

  it("code không phải chuỗi → bỏ qua", async () => {
    stubFetch(jsonResponse({ data: null, error: { message: "x", code: 42 } }, 400));
    const error = await rejection(fetchDriveFiles({}));
    expect(error.code).toBeUndefined();
  });
});

describe("shouldRetryDriveFiles", () => {
  it.each([400, 401, 403, 404, 499])("không retry ApiRequestError %i", (status) => {
    expect(shouldRetryDriveFiles(0, new ApiRequestError("x", status))).toBe(false);
  });

  it("retry 5xx tối đa 2 lần", () => {
    const error = new ApiRequestError("x", 502);
    expect(shouldRetryDriveFiles(0, error)).toBe(true);
    expect(shouldRetryDriveFiles(1, error)).toBe(true);
    expect(shouldRetryDriveFiles(2, error)).toBe(false);
  });

  it("lỗi mạng (không phải ApiRequestError) retry tối đa 2 lần", () => {
    const error = new TypeError("Failed to fetch");
    expect(shouldRetryDriveFiles(1, error)).toBe(true);
    expect(shouldRetryDriveFiles(2, error)).toBe(false);
  });
});
