import { afterEach, describe, expect, it, vi } from "vitest";
import { DRIVE_NOT_CONNECTED_CODE, PICKER_NOT_CONFIGURED_CODE } from "@/domain/drive-files";
import type { DriveFileItem, PickerTokenResponse } from "@/domain/types";
import {
  ATTACH_FILE_CLIENT_TIMEOUT_MS,
  ATTACH_FILE_PATH,
  PICKER_TOKEN_CLIENT_TIMEOUT_MS,
  PICKER_TOKEN_PATH,
  buildAttachFileBody,
  fetchPickerToken,
  postAttachFile,
} from "./attach-doc-api";
import { CREATE_DOC_TIMEOUT_CODE, CreateDocRequestError } from "./create-doc-api";

const TOKEN: PickerTokenResponse = {
  accessToken: "ya29.token",
  expiresAt: "2026-11-27T09:00:00.000Z",
  developerKey: "AIza-key",
  appId: "123456789012",
};

const FILE: DriveFileItem = {
  id: "shortcut1",
  name: "Kế hoạch",
  kind: "doc",
  url: "https://docs.google.com/document/d/target1/edit",
  modifiedAt: "2026-11-27T08:00:00.000Z",
  spaceId: "s1",
  projectId: "p1",
  spaceName: "Marketing",
  projectName: "Ra mắt",
  shortcut: true,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function stubFetch(response: Response | (() => Promise<Response>)) {
  const fake = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () =>
    typeof response === "function" ? response() : response,
  );
  vi.stubGlobal("fetch", fake);
  return fake;
}

/** fetch không bao giờ trả lời; chỉ kết thúc khi `init.signal` bị abort (giống trình duyệt). */
function stubHangingFetch() {
  const fake = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
    (_input, init) =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) return;
        if (signal.aborted) reject(signal.reason);
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
  );
  vi.stubGlobal("fetch", fake);
  return fake;
}

async function rejection(promise: Promise<unknown>): Promise<CreateDocRequestError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(CreateDocRequestError);
    return error as CreateDocRequestError;
  }
  throw new Error("expected rejection");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("fetchPickerToken", () => {
  it("200 → token đúng hình dạng, GET kèm signal, Accept JSON, no-store", async () => {
    const fake = stubFetch(jsonResponse({ data: TOKEN }));
    const controller = new AbortController();
    await expect(fetchPickerToken(controller.signal)).resolves.toEqual(TOKEN);
    const [url, init] = fake.mock.calls[0];
    expect(url).toBe(PICKER_TOKEN_PATH);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.method ?? "GET").toBe("GET");
    expect(init?.cache).toBe("no-store");
    expect(new Headers(init?.headers).get("Accept")).toBe("application/json");
  });

  it("expiresAt null được chấp nhận; trường thừa bị bỏ", async () => {
    stubFetch(jsonResponse({ data: { ...TOKEN, expiresAt: null, extra: "x" } }));
    await expect(fetchPickerToken()).resolves.toEqual({ ...TOKEN, expiresAt: null });
  });

  it("503 picker_not_configured → lỗi mang status + code", async () => {
    stubFetch(jsonResponse({ error: { message: "x", code: PICKER_NOT_CONFIGURED_CODE } }, 503));
    const error = await rejection(fetchPickerToken());
    expect(error.status).toBe(503);
    expect(error.code).toBe(PICKER_NOT_CONFIGURED_CODE);
  });

  it("403 drive_not_connected", async () => {
    stubFetch(jsonResponse({ error: { message: "x", code: DRIVE_NOT_CONNECTED_CODE } }, 403));
    const error = await rejection(fetchPickerToken());
    expect(error.status).toBe(403);
    expect(error.code).toBe(DRIVE_NOT_CONNECTED_CODE);
  });

  it("JSON hỏng → lỗi phản hồi không hợp lệ", async () => {
    stubFetch(new Response("not json", { status: 200 }));
    const error = await rejection(fetchPickerToken());
    expect(error.status).toBe(200);
    expect(error.code).toBeUndefined();
  });

  it.each([
    ["thiếu accessToken", { ...TOKEN, accessToken: undefined }],
    ["accessToken rỗng", { ...TOKEN, accessToken: "" }],
    ["thiếu developerKey", { ...TOKEN, developerKey: undefined }],
    ["developerKey khoảng trắng", { ...TOKEN, developerKey: "  " }],
    ["thiếu appId", { ...TOKEN, appId: undefined }],
    ["appId là số", { ...TOKEN, appId: 123 }],
    ["thiếu expiresAt", { ...TOKEN, expiresAt: undefined }],
    ["expiresAt là số", { ...TOKEN, expiresAt: 1 }],
  ])("%s → lỗi", async (_label, data) => {
    stubFetch(jsonResponse({ data }));
    await rejection(fetchPickerToken());
  });

  it("data không phải object → lỗi", async () => {
    stubFetch(jsonResponse({ data: [TOKEN] }));
    await rejection(fetchPickerToken());
  });

  it("mặc định hạn chờ 15 s", async () => {
    const spy = vi.spyOn(AbortSignal, "timeout");
    stubFetch(jsonResponse({ data: TOKEN }));
    await fetchPickerToken();
    expect(PICKER_TOKEN_CLIENT_TIMEOUT_MS).toBe(15_000);
    expect(spy).toHaveBeenCalledWith(15_000);
  });

  it("mạng treo quá hạn → status 0, code timeout", async () => {
    stubHangingFetch();
    const error = await rejection(fetchPickerToken(undefined, { timeoutMs: 5 }));
    expect(error.status).toBe(0);
    expect(error.code).toBe(CREATE_DOC_TIMEOUT_CODE);
  });

  it("có signal ngoài, mạng treo quá hạn → vẫn code timeout", async () => {
    stubHangingFetch();
    const controller = new AbortController();
    const error = await rejection(fetchPickerToken(controller.signal, { timeoutMs: 5 }));
    expect(error.code).toBe(CREATE_DOC_TIMEOUT_CODE);
    expect(controller.signal.aborted).toBe(false);
  });

  it("signal ngoài abort → ném lại AbortError, không đổi thành timeout", async () => {
    stubHangingFetch();
    const controller = new AbortController();
    const pending = fetchPickerToken(controller.signal, { timeoutMs: 60_000 });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await expect(pending).rejects.not.toBeInstanceOf(CreateDocRequestError);
  });

  it("signal ngoài đã abort từ trước → AbortError", async () => {
    stubHangingFetch();
    await expect(fetchPickerToken(AbortSignal.abort(), { timeoutMs: 60_000 })).rejects.toMatchObject({ name: "AbortError" });
  });

  it("không có AbortSignal.any → tự gộp signal, vẫn abort được", async () => {
    vi.stubGlobal("AbortSignal", Object.assign(Object.create(AbortSignal), { any: undefined, timeout: AbortSignal.timeout }));
    stubHangingFetch();
    const controller = new AbortController();
    const pending = fetchPickerToken(controller.signal, { timeoutMs: 60_000 });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("postAttachFile", () => {
  const body = { driveFileId: "1AbCdEfGhIjKlMnOp", spaceId: "s1", projectId: "p1" };

  it("201 → DriveFileItem; POST JSON tới /api/files/attach", async () => {
    const fake = stubFetch(jsonResponse({ data: { file: FILE } }, 201));
    await expect(postAttachFile(body)).resolves.toEqual(FILE);
    const [url, init] = fake.mock.calls[0];
    expect(url).toBe(ATTACH_FILE_PATH);
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
    expect(JSON.parse(String(init?.body))).toEqual(body);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    [409, "already_attached"],
    [404, "invalid_target"],
    [404, undefined],
    [403, DRIVE_NOT_CONNECTED_CODE],
    [502, undefined],
    [400, undefined],
  ])("%i (%s) → lỗi mang status + code", async (status, code) => {
    stubFetch(jsonResponse({ error: { message: "x", ...(code ? { code } : {}) } }, status));
    const error = await rejection(postAttachFile(body));
    expect(error.status).toBe(status);
    expect(error.code).toBe(code);
  });

  it("201 nhưng file sai hình dạng → lỗi", async () => {
    stubFetch(jsonResponse({ data: { file: { ...FILE, shortcut: undefined } } }, 201));
    await rejection(postAttachFile(body));
  });

  it("hết hạn chờ → status 0, code timeout", async () => {
    vi.spyOn(AbortSignal, "timeout").mockImplementation(() => AbortSignal.abort(new DOMException("t", "TimeoutError")));
    stubFetch(() => Promise.reject(new DOMException("t", "TimeoutError")));
    const error = await rejection(postAttachFile(body, { timeoutMs: 10 }));
    expect(error.status).toBe(0);
    expect(error.code).toBe(CREATE_DOC_TIMEOUT_CODE);
  });

  it("mặc định hạn chờ 45 s", async () => {
    const spy = vi.spyOn(AbortSignal, "timeout");
    stubFetch(jsonResponse({ data: { file: FILE } }, 201));
    await postAttachFile(body);
    expect(ATTACH_FILE_CLIENT_TIMEOUT_MS).toBe(45_000);
    expect(spy).toHaveBeenCalledWith(45_000);
  });

  it("lỗi mạng khác → ném lại nguyên lỗi", async () => {
    const network = new TypeError("Failed to fetch");
    stubFetch(() => Promise.reject(network));
    await expect(postAttachFile(body)).rejects.toBe(network);
  });
});

describe("buildAttachFileBody", () => {
  it("giữ projectId không rỗng (trim)", () => {
    expect(buildAttachFileBody({ driveFileId: "abc", spaceId: "s1", projectId: " p1 " })).toEqual({
      driveFileId: "abc",
      spaceId: "s1",
      projectId: "p1",
    });
  });

  it.each(["", "   ", undefined])("projectId %j → bỏ khoá", (projectId) => {
    const result = buildAttachFileBody({ driveFileId: "abc", spaceId: "s1", projectId });
    expect(result).toEqual({ driveFileId: "abc", spaceId: "s1" });
    expect("projectId" in result).toBe(false);
  });

  it("không sửa input", () => {
    const input = { driveFileId: "abc", spaceId: "s1", projectId: " p1 " };
    buildAttachFileBody(input);
    expect(input).toEqual({ driveFileId: "abc", spaceId: "s1", projectId: " p1 " });
  });
});
