import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({ prisma: {} }));

import { GoogleNotConnectedError } from "./client";
import {
  classifyDriveError,
  driveErrorLogFields,
  driveErrorReason,
  isDriveRateLimitReason,
  isSilentDriveError,
} from "./drive-errors";
import { GoogleScopeMissingError } from "./granted-scopes";
import { GOOGLE_SCOPES } from "./scopes";

const GAXIOS_SYMBOL = Symbol.for("gaxios-gaxios-error");
const SECRETS = ["ya29.SECRET", "SECRET-IN-MESSAGE", "access_token=SECRET", "1//refresh-SECRET"];

/** Lỗi giống GaxiosError: name "Error", có config chứa token, response, status. */
function gaxiosLike(opts: { status?: unknown; symbol?: boolean; code?: unknown } = {}) {
  const err = new Error("Request failed SECRET-IN-MESSAGE ya29.SECRET") as Error & Record<PropertyKey, unknown>;
  err.config = {
    url: "https://www.googleapis.com/drive/v3/files?access_token=SECRET",
    headers: { Authorization: "Bearer ya29.SECRET" },
    data: { refresh_token: "1//refresh-SECRET" },
  };
  err.response = { status: opts.status, data: { error: "SECRET-IN-MESSAGE" }, config: err.config };
  if ("status" in opts) err.status = opts.status;
  if (opts.symbol) err[GAXIOS_SYMBOL] = "8.3.3";
  if ("code" in opts) err.code = opts.code;
  return err;
}

function expectNoSecrets(value: unknown) {
  const text = JSON.stringify(value);
  for (const s of SECRETS) expect(text).not.toContain(s);
  expect(text).not.toContain("googleapis.com");
  expect(text).not.toContain("Bearer");
}

describe("classifyDriveError", () => {
  it("GoogleNotConnectedError thật → not_connected", () => {
    expect(classifyDriveError(new GoogleNotConnectedError())).toEqual({
      kind: "not_connected",
      name: "GoogleNotConnectedError",
    });
  });

  it("GoogleScopeMissingError thật → scope_missing", () => {
    expect(classifyDriveError(new GoogleScopeMissingError(GOOGLE_SCOPES.drive))).toEqual({
      kind: "scope_missing",
      name: "GoogleScopeMissingError",
    });
  });

  it.each([403, 404, 500, 100, 599])("gaxios có symbol, status %i → google + status", (status) => {
    const result = classifyDriveError(gaxiosLike({ status, symbol: true }));
    expect(result).toEqual({ kind: "google", name: "GaxiosError", status });
    expectNoSecrets(result);
  });

  it("không có symbol nhưng có status số + config → google", () => {
    expect(classifyDriveError(gaxiosLike({ status: 403 }))).toEqual({
      kind: "google",
      name: "GaxiosError",
      status: 403,
    });
  });

  it("có symbol nhưng không có status (lỗi mạng) → google, không status", () => {
    const result = classifyDriveError(gaxiosLike({ symbol: true }));
    expect(result).toEqual({ kind: "google", name: "GaxiosError" });
    expect("status" in result).toBe(false);
  });

  it.each(["500", 9999, 99, 600, 403.5, Number.NaN, -1])("status lạ %s bị bỏ", (status) => {
    const result = classifyDriveError(gaxiosLike({ status, symbol: true }));
    expect(result).toEqual({ kind: "google", name: "GaxiosError" });
  });

  it("status chuỗi và không có symbol → không coi là gaxios", () => {
    expect(classifyDriveError(gaxiosLike({ status: "500" }))).toEqual({ kind: "unknown", name: "Error" });
  });

  it("gaxios có code TimeoutError → timeout", () => {
    const result = classifyDriveError(gaxiosLike({ symbol: true, code: "TimeoutError" }));
    expect(result).toEqual({ kind: "timeout", name: "TimeoutError" });
    expectNoSecrets(result);
  });

  it("gaxios có code AbortError → timeout", () => {
    expect(classifyDriveError(gaxiosLike({ symbol: true, code: "AbortError" }))).toEqual({
      kind: "timeout",
      name: "AbortError",
    });
  });

  it("DOMException TimeoutError / AbortError → timeout", () => {
    expect(classifyDriveError(new DOMException("timed out", "TimeoutError"))).toEqual({
      kind: "timeout",
      name: "TimeoutError",
    });
    expect(classifyDriveError(new DOMException("aborted", "AbortError"))).toEqual({
      kind: "timeout",
      name: "AbortError",
    });
  });

  it("Error có name TimeoutError → timeout", () => {
    const err = new Error("SECRET-IN-MESSAGE");
    err.name = "TimeoutError";
    expect(classifyDriveError(err)).toEqual({ kind: "timeout", name: "TimeoutError" });
  });

  it("Error thường → unknown với name", () => {
    expect(classifyDriveError(new TypeError("boom SECRET-IN-MESSAGE"))).toEqual({
      kind: "unknown",
      name: "TypeError",
    });
  });

  it("Error có name rỗng → UnknownError", () => {
    const err = new Error("x");
    err.name = "";
    expect(classifyDriveError(err)).toEqual({ kind: "unknown", name: "UnknownError" });
  });

  it.each([null, undefined, "ya29.SECRET", 42, { status: 500 }, { name: "GaxiosError", message: "ya29.SECRET" }])(
    "giá trị không phải Error %# → unknown",
    (value) => {
      const result = classifyDriveError(value);
      expect(result.kind).toBe("unknown");
      expect(result.name).toBe("UnknownError");
      expectNoSecrets(result);
    },
  );

  it("đối tượng có name GoogleNotConnectedError (khác realm) vẫn nhận diện theo name", () => {
    expect(classifyDriveError({ name: "GoogleNotConnectedError" }).kind).toBe("not_connected");
  });

  it("không đọc message / config / response (getter ném nếu bị đọc)", () => {
    const err = gaxiosLike({ status: 500, symbol: true });
    for (const key of ["message", "config", "response", "stack"]) {
      Object.defineProperty(err, key, {
        get() {
          throw new Error(`đọc ${key}`);
        },
      });
    }
    // config chỉ được kiểm tra bằng `in`, không đọc giá trị.
    expect(classifyDriveError(err)).toEqual({ kind: "google", name: "GaxiosError", status: 500 });
  });
});

describe("driveErrorLogFields", () => {
  it("google: error + status", () => {
    const fields = driveErrorLogFields(gaxiosLike({ status: 403, symbol: true }));
    expect(fields).toEqual({ error: "GaxiosError", status: 403 });
    expectNoSecrets(fields);
  });

  it("không có status → chỉ error", () => {
    const fields = driveErrorLogFields(new DOMException("t", "TimeoutError"));
    expect(fields).toEqual({ error: "TimeoutError" });
    expect("status" in fields).toBe(false);
  });

  it("chuỗi chứa token → UnknownError, không lộ token", () => {
    const fields = driveErrorLogFields("Bearer ya29.SECRET");
    expect(fields).toEqual({ error: "UnknownError" });
    expectNoSecrets(fields);
  });
});

describe("isSilentDriveError", () => {
  it("not_connected / scope_missing không log", () => {
    expect(isSilentDriveError("not_connected")).toBe(true);
    expect(isSilentDriveError("scope_missing")).toBe(true);
  });

  it("các loại khác cần log", () => {
    expect(isSilentDriveError("timeout")).toBe(false);
    expect(isSilentDriveError("google")).toBe(false);
    expect(isSilentDriveError("unknown")).toBe(false);
  });
});

/** Gaxios có symbol, status, và `reason` đặt ở `response.data.error.errors[0]` và/hoặc `errors[0]`. */
function gaxiosWithReason(opts: { responseReason?: unknown; topReason?: unknown; status?: number }) {
  const err = gaxiosLike({ status: opts.status ?? 403, symbol: true });
  if ("responseReason" in opts) {
    err.response = {
      status: opts.status ?? 403,
      data: { error: { message: "SECRET-IN-MESSAGE", errors: [{ reason: opts.responseReason, message: "ya29.SECRET" }] } },
    };
  }
  if ("topReason" in opts) err.errors = [{ reason: opts.topReason, message: "SECRET-IN-MESSAGE" }];
  return err;
}

describe("driveErrorReason", () => {
  it.each([
    "forbidden",
    "insufficientFilePermissions",
    "appNotAuthorizedToFile",
    "rateLimitExceeded",
    "userRateLimitExceeded",
    "dailyLimitExceeded",
    "quotaExceeded",
  ])("đọc reason %s từ response.data.error.errors[0]", (reason) => {
    expect(driveErrorReason(gaxiosWithReason({ responseReason: reason }))).toBe(reason);
  });

  it("đọc reason từ error.errors[0] khi response không có", () => {
    expect(driveErrorReason(gaxiosWithReason({ topReason: "userRateLimitExceeded" }))).toBe("userRateLimitExceeded");
  });

  it("ưu tiên response.data.error.errors[0]", () => {
    expect(driveErrorReason(gaxiosWithReason({ responseReason: "forbidden", topReason: "rateLimitExceeded" }))).toBe(
      "forbidden",
    );
  });

  it("reason ngoài danh sách cố định → undefined (không đưa chuỗi lạ vào log)", () => {
    expect(driveErrorReason(gaxiosWithReason({ responseReason: "ya29.SECRET" }))).toBeUndefined();
    expect(driveErrorReason(gaxiosWithReason({ topReason: "notARealReason" }))).toBeUndefined();
  });

  it.each([
    ["không có errors", gaxiosLike({ status: 403, symbol: true })],
    ["reason không phải chuỗi", gaxiosWithReason({ responseReason: 42 })],
    ["errors rỗng", Object.assign(gaxiosLike({ status: 403, symbol: true }), { errors: [] })],
    ["errors không phải mảng", Object.assign(gaxiosLike({ status: 403, symbol: true }), { errors: "forbidden" })],
  ])("%s → undefined", (_label, err) => {
    expect(driveErrorReason(err)).toBeUndefined();
  });

  it("lỗi không phải gaxios → undefined dù có errors[0].reason", () => {
    const err = Object.assign(new Error("x"), { errors: [{ reason: "forbidden" }] });
    expect(driveErrorReason(err)).toBeUndefined();
    expect(driveErrorReason(null)).toBeUndefined();
    expect(driveErrorReason("forbidden")).toBeUndefined();
  });

  it("getter ném khi đọc response / errors → undefined, không ném", () => {
    const err = gaxiosLike({ status: 403, symbol: true });
    for (const key of ["response", "errors"]) {
      Object.defineProperty(err, key, {
        get() {
          throw new Error(`đọc ${key}`);
        },
      });
    }
    expect(driveErrorReason(err)).toBeUndefined();
  });

  it("không đọc message / config", () => {
    const err = gaxiosWithReason({ responseReason: "forbidden" });
    for (const key of ["message", "config"]) {
      Object.defineProperty(err, key, {
        get() {
          throw new Error(`đọc ${key}`);
        },
      });
    }
    expect(driveErrorReason(err)).toBe("forbidden");
  });
});

describe("isDriveRateLimitReason", () => {
  it.each(["rateLimitExceeded", "userRateLimitExceeded", "dailyLimitExceeded", "quotaExceeded", "sharingRateLimitExceeded"] as const)(
    "%s → true",
    (reason) => {
      expect(isDriveRateLimitReason(reason)).toBe(true);
    },
  );

  it.each(["forbidden", "insufficientFilePermissions", "appNotAuthorizedToFile", undefined] as const)("%s → false", (reason) => {
    expect(isDriveRateLimitReason(reason)).toBe(false);
  });
});
