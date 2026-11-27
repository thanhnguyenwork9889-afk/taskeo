import { afterEach, describe, expect, it, vi } from "vitest";
import { DRIVE_NOT_CONNECTED_CODE } from "@/domain/drive-files";
import type { DriveFileItem } from "@/domain/types";
import {
  CreateDocRequestError,
  buildCreateFileBody,
  fetchApiProjects,
  fetchApiSpaces,
  postDriveFile,
  shouldRetryCreateDocQuery,
} from "./create-doc-api";

const FILE: DriveFileItem = {
  id: "f1",
  name: "Kế hoạch",
  kind: "doc",
  url: "https://docs.google.com/document/d/f1/edit",
  modifiedAt: "2026-11-27T08:00:00.000Z",
  spaceId: "s1",
  projectId: null,
  spaceName: "Marketing",
  projectName: null,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function stubFetch(response: Response) {
  const fake = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => response);
  vi.stubGlobal("fetch", fake);
  return fake;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function rejection(promise: Promise<unknown>): Promise<CreateDocRequestError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(CreateDocRequestError);
    return error as CreateDocRequestError;
  }
  throw new Error("expected rejection");
}

describe("CreateDocRequestError", () => {
  it("mang status, code và name riêng", () => {
    const error = new CreateDocRequestError("x", 403, DRIVE_NOT_CONNECTED_CODE);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("CreateDocRequestError");
    expect(error.status).toBe(403);
    expect(error.code).toBe(DRIVE_NOT_CONNECTED_CODE);
  });
});

describe("buildCreateFileBody", () => {
  it("trim tên, giữ projectId có giá trị", () => {
    const values = { name: "  Kế hoạch  ", kind: "sheet" as const, spaceId: "s1", projectId: "p1" };
    expect(buildCreateFileBody(values)).toEqual({ name: "Kế hoạch", kind: "sheet", spaceId: "s1", projectId: "p1" });
  });

  it("bỏ projectId rỗng / chỉ khoảng trắng và không sửa input", () => {
    const values = { name: "A", kind: "doc" as const, spaceId: "s1", projectId: "  " };
    const body = buildCreateFileBody(values);
    expect(body).toEqual({ name: "A", kind: "doc", spaceId: "s1" });
    expect("projectId" in body).toBe(false);
    expect(values.projectId).toBe("  ");
  });

  it("tên chỉ khoảng trắng → chuỗi rỗng (server trả 400)", () => {
    expect(buildCreateFileBody({ name: "   ", kind: "slide", spaceId: "s1", projectId: "" }).name).toBe("");
  });
});

describe("fetchApiSpaces", () => {
  it("trả {id,name} từ data: Space[]", async () => {
    const fake = stubFetch(
      jsonResponse({ data: [{ id: "s1", name: "Marketing", color: "#000", driveFolderId: null }], error: null }),
    );
    await expect(fetchApiSpaces()).resolves.toEqual([{ id: "s1", name: "Marketing" }]);
    expect(fake.mock.calls[0][0]).toBe("/api/spaces");
  });

  it("401 → lỗi kèm status và message từ envelope", async () => {
    stubFetch(jsonResponse({ data: null, error: { message: "Hết phiên" } }, 401));
    const error = await rejection(fetchApiSpaces());
    expect(error.status).toBe(401);
    expect(error.message).toBe("Hết phiên");
  });

  it("JSON hỏng / sai hình dạng → lỗi", async () => {
    stubFetch(new Response("{not json", { status: 200 }));
    expect((await rejection(fetchApiSpaces())).status).toBe(200);
    stubFetch(jsonResponse({ data: [{ id: 1, name: "x" }], error: null }));
    await rejection(fetchApiSpaces());
    stubFetch(jsonResponse({ data: { spaces: [] }, error: null }));
    await rejection(fetchApiSpaces());
  });
});

describe("fetchApiProjects", () => {
  it("encode spaceId và trả {id,name}", async () => {
    const fake = stubFetch(jsonResponse({ data: [{ id: "p1", spaceId: "s/1", name: "Ra mắt" }], error: null }));
    await expect(fetchApiProjects("s/1")).resolves.toEqual([{ id: "p1", name: "Ra mắt" }]);
    expect(fake.mock.calls[0][0]).toBe("/api/spaces/s%2F1/projects");
  });

  it("404 → lỗi 404; sai hình dạng → lỗi", async () => {
    stubFetch(jsonResponse({ data: null, error: { message: "Không tìm thấy" } }, 404));
    expect((await rejection(fetchApiProjects("s1"))).status).toBe(404);
    stubFetch(jsonResponse({ data: [null], error: null }));
    await rejection(fetchApiProjects("s1"));
  });
});

describe("postDriveFile", () => {
  const body = { name: "Kế hoạch", kind: "doc" as const, spaceId: "s1" };

  it("POST JSON tới /api/files và trả file khi 201", async () => {
    const fake = stubFetch(jsonResponse({ data: { file: FILE }, error: null }, 201));
    await expect(postDriveFile(body)).resolves.toEqual(FILE);
    const [url, init] = fake.mock.calls[0];
    expect(url).toBe("/api/files");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual(body);
  });

  it("url không phải Drive → null", async () => {
    stubFetch(jsonResponse({ data: { file: { ...FILE, url: "javascript:alert(1)" } }, error: null }, 201));
    expect((await postDriveFile(body)).url).toBeNull();
  });

  it("403 có code drive_not_connected", async () => {
    stubFetch(jsonResponse({ data: null, error: { message: "Chưa kết nối", code: DRIVE_NOT_CONNECTED_CODE } }, 403));
    const error = await rejection(postDriveFile(body));
    expect(error.status).toBe(403);
    expect(error.code).toBe(DRIVE_NOT_CONNECTED_CODE);
  });

  it("502 không có message → câu mặc định", async () => {
    stubFetch(jsonResponse({ data: null, error: {} }, 502));
    const error = await rejection(postDriveFile(body));
    expect(error.status).toBe(502);
    expect(error.message.length).toBeGreaterThan(0);
  });

  it("JSON hỏng hoặc sai hình dạng → lỗi", async () => {
    stubFetch(new Response("oops", { status: 201 }));
    await rejection(postDriveFile(body));
    stubFetch(jsonResponse({ data: { file: { ...FILE, kind: "pdf" } }, error: null }, 201));
    await rejection(postDriveFile(body));
    stubFetch(jsonResponse({ data: FILE, error: null }, 201));
    await rejection(postDriveFile(body));
  });
});

describe("shouldRetryCreateDocQuery", () => {
  it("4xx không thử lại; 5xx / lỗi mạng thử lại 1 lần", () => {
    expect(shouldRetryCreateDocQuery(0, new CreateDocRequestError("x", 401))).toBe(false);
    expect(shouldRetryCreateDocQuery(0, new CreateDocRequestError("x", 404))).toBe(false);
    expect(shouldRetryCreateDocQuery(0, new CreateDocRequestError("x", 502))).toBe(true);
    expect(shouldRetryCreateDocQuery(0, new TypeError("network"))).toBe(true);
    expect(shouldRetryCreateDocQuery(1, new TypeError("network"))).toBe(false);
  });
});
