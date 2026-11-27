import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  duplicateQueryKeyMessage,
  fail,
  failWithCode,
  handleUnexpected,
  isValidRouteId,
  ok,
  readJson,
  unauthorized,
  unavailable,
  validationError,
} from "./http";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("ok / fail", () => {
  it("ok mặc định 200 với { data, error: null }", async () => {
    const response = ok({ a: 1 });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { a: 1 }, error: null });
  });

  it("ok nhận status tuỳ chọn", () => {
    expect(ok({}, 201).status).toBe(201);
  });

  it("fail trả { data: null, error: { message } } và chỉ thêm details khi có", async () => {
    expect(await fail(404, "Không tìm thấy").json()).toEqual({ data: null, error: { message: "Không tìm thấy" } });
    expect(await fail(400, "x", { a: 1 }).json()).toEqual({ data: null, error: { message: "x", details: { a: 1 } } });
  });

  it("fail không có code (tương thích ngược)", async () => {
    expect((await fail(400, "x").json()).error).not.toHaveProperty("code");
  });

  it("failWithCode trả { data: null, error: { message, code } }", async () => {
    const response = failWithCode(403, "Chưa kết nối", "drive_not_connected");
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      data: null,
      error: { message: "Chưa kết nối", code: "drive_not_connected" },
    });
  });

  it("unauthorized / unavailable trả 401 / 503", () => {
    expect(unauthorized().status).toBe(401);
    expect(unavailable().status).toBe(503);
  });
});

describe("readJson", () => {
  it("đọc body JSON hợp lệ", async () => {
    const result = await readJson(new Request("http://x", { method: "POST", body: '{"a":1}' }));
    expect(result).toEqual({ ok: true, value: { a: 1 } });
  });

  it("trả 400 khi JSON hỏng hoặc rỗng", async () => {
    for (const body of ["{", ""]) {
      const result = await readJson(new Request("http://x", { method: "POST", body }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response.status).toBe(400);
        expect((await result.response.json()).error.message).toBe("Dữ liệu gửi lên không phải JSON hợp lệ");
      }
    }
  });
});

describe("validationError", () => {
  it("trả 400 với details = z.flattenError", async () => {
    const parsed = z.strictObject({ name: z.string().min(1) }).safeParse({ name: "", extra: 1 });
    if (parsed.success) throw new Error("phải lỗi");
    const body = await validationError(parsed.error).json();
    expect(body.error.details).toEqual(z.flattenError(parsed.error));
  });
});

describe("handleUnexpected", () => {
  it("log context + name + message + stack, trả 500 chung không lộ chi tiết", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new TypeError("db password=abc");
    const response = handleUnexpected(error, "GET /api/spaces");
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain("password");
    expect(text).not.toContain("TypeError");
    expect(spy).toHaveBeenCalledWith("GET /api/spaces", {
      name: "TypeError",
      message: "db password=abc",
      stack: error.stack,
    });
  });

  it("chịu được giá trị ném không phải Error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    handleUnexpected("boom", "ctx");
    expect(spy).toHaveBeenCalledWith("ctx", { message: "boom" });
  });
});

describe("isValidRouteId", () => {
  it("nhận id 1–64 ký tự", () => {
    expect(isValidRouteId("a")).toBe(true);
    expect(isValidRouteId("clx0abc123")).toBe(true);
    expect(isValidRouteId("x".repeat(64))).toBe(true);
  });

  it("từ chối id rỗng hoặc dài hơn 64 ký tự", () => {
    expect(isValidRouteId("")).toBe(false);
    expect(isValidRouteId("x".repeat(65))).toBe(false);
  });

  it("từ chối id có ký tự NUL (Postgres không so được → 500)", () => {
    expect(isValidRouteId("a\u0000b")).toBe(false);
  });
});

describe("duplicateQueryKeyMessage", () => {
  it("nêu tên key bị gửi lặp", () => {
    expect(duplicateQueryKeyMessage("limit")).toBe('Tham số "limit" chỉ được gửi một lần');
  });
});
