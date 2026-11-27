import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import {
  REVOKE_TIMEOUT_MS,
  buildDisconnectedAccountUpdate,
  classifyRevokeResponse,
  revokeGoogleToken,
  selectRevokeToken,
} from "./revoke";
import { GOOGLE_SIGN_IN_GRANTED_SCOPE } from "./scopes";

const TOKEN = "1//secret-refresh-token-value";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const CONSOLE_METHODS = ["error", "warn", "log", "info", "debug"] as const;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function fakeFetch(impl: () => Promise<Response>) {
  return vi.fn<typeof fetch>(impl);
}

function stringifyArg(arg: unknown): string {
  if (arg instanceof Error) return `${arg.name} ${arg.message} ${arg.stack ?? ""}`;
  if (typeof arg === "string") return arg;
  try {
    return JSON.stringify(arg) ?? String(arg);
  } catch {
    return String(arg);
  }
}

describe("selectRevokeToken", () => {
  it("có cả hai → chọn refresh token", () => {
    expect(selectRevokeToken({ refresh_token: "enc-refresh", access_token: "enc-access" })).toBe(
      "enc-refresh",
    );
  });

  it("chỉ có access token → chọn access token", () => {
    expect(selectRevokeToken({ refresh_token: null, access_token: "enc-access" })).toBe(
      "enc-access",
    );
  });

  it("chuỗi rỗng coi như không có", () => {
    expect(selectRevokeToken({ refresh_token: "", access_token: "enc-access" })).toBe("enc-access");
    expect(selectRevokeToken({ refresh_token: "", access_token: "" })).toBeNull();
  });

  it("không có token nào → null", () => {
    expect(selectRevokeToken({ refresh_token: null, access_token: null })).toBeNull();
  });
});

describe("classifyRevokeResponse", () => {
  it("200 → revoked", () => {
    expect(classifyRevokeResponse(200, {})).toBe("revoked");
    expect(classifyRevokeResponse(200, null)).toBe("revoked");
  });

  it("400 + invalid_token → already-invalid", () => {
    expect(classifyRevokeResponse(400, { error: "invalid_token" })).toBe("already-invalid");
  });

  it("400 với lỗi khác hoặc body không phải object → failed", () => {
    expect(classifyRevokeResponse(400, { error: "invalid_request" })).toBe("failed");
    expect(classifyRevokeResponse(400, "invalid_token")).toBe("failed");
    expect(classifyRevokeResponse(400, null)).toBe("failed");
    expect(classifyRevokeResponse(400, undefined)).toBe("failed");
    expect(classifyRevokeResponse(400, ["invalid_token"])).toBe("failed");
  });

  it("invalid_token nhưng không phải 400 → failed", () => {
    expect(classifyRevokeResponse(401, { error: "invalid_token" })).toBe("failed");
    expect(classifyRevokeResponse(500, { error: "invalid_token" })).toBe("failed");
  });

  it("5xx / 3xx / 2xx khác 200 → failed", () => {
    expect(classifyRevokeResponse(500, {})).toBe("failed");
    expect(classifyRevokeResponse(503, {})).toBe("failed");
    expect(classifyRevokeResponse(302, {})).toBe("failed");
    expect(classifyRevokeResponse(204, {})).toBe("failed");
  });
});

describe("revokeGoogleToken", () => {
  let consoleSpies: MockInstance[];

  beforeEach(() => {
    consoleSpies = CONSOLE_METHODS.map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );
  });

  afterEach(() => {
    for (const spy of consoleSpies) {
      for (const args of spy.mock.calls) {
        for (const arg of args) {
          expect(stringifyArg(arg)).not.toContain(TOKEN);
        }
      }
    }
    vi.restoreAllMocks();
  });

  it("200 → revoked", async () => {
    const fetchImpl = fakeFetch(async () => jsonResponse(200, {}));
    await expect(revokeGoogleToken(TOKEN, fetchImpl)).resolves.toBe("revoked");
  });

  it("200 với body rỗng → revoked", async () => {
    const fetchImpl = fakeFetch(async () => new Response("", { status: 200 }));
    await expect(revokeGoogleToken(TOKEN, fetchImpl)).resolves.toBe("revoked");
  });

  it("400 invalid_token → already-invalid", async () => {
    const fetchImpl = fakeFetch(async () =>
      jsonResponse(400, { error: "invalid_token", error_description: "Token expired or revoked" }),
    );
    await expect(revokeGoogleToken(TOKEN, fetchImpl)).resolves.toBe("already-invalid");
  });

  it("400 invalid_request → failed, có log status", async () => {
    const fetchImpl = fakeFetch(async () => jsonResponse(400, { error: "invalid_request" }));
    await expect(revokeGoogleToken(TOKEN, fetchImpl)).resolves.toBe("failed");
    expect(console.error).toHaveBeenCalled();
  });

  it("500 → failed", async () => {
    const fetchImpl = fakeFetch(async () => jsonResponse(500, { error: "internal" }));
    await expect(revokeGoogleToken(TOKEN, fetchImpl)).resolves.toBe("failed");
  });

  it("400 với JSON hỏng → failed", async () => {
    const fetchImpl = fakeFetch(async () => new Response("{not json", { status: 400 }));
    await expect(revokeGoogleToken(TOKEN, fetchImpl)).resolves.toBe("failed");
  });

  it("body phản hồi chứa token cũng không bị log", async () => {
    const fetchImpl = fakeFetch(async () => jsonResponse(400, { error: "x", echo: TOKEN }));
    await expect(revokeGoogleToken(TOKEN, fetchImpl)).resolves.toBe("failed");
  });

  it("fetch ném TypeError (mạng) → failed, không log message", async () => {
    const fetchImpl = fakeFetch(async () => {
      throw new TypeError(`fetch failed for token=${TOKEN}`);
    });
    await expect(revokeGoogleToken(TOKEN, fetchImpl)).resolves.toBe("failed");
    expect(console.error).toHaveBeenCalled();
  });

  it("fetch ném lỗi TimeoutError → failed", async () => {
    const fetchImpl = fakeFetch(async () => {
      throw new DOMException(`timed out ${TOKEN}`, "TimeoutError");
    });
    await expect(revokeGoogleToken(TOKEN, fetchImpl)).resolves.toBe("failed");
  });

  it("fetch ném AbortError → failed", async () => {
    const fetchImpl = fakeFetch(async () => {
      throw new DOMException(`aborted ${TOKEN}`, "AbortError");
    });
    await expect(revokeGoogleToken(TOKEN, fetchImpl)).resolves.toBe("failed");
  });

  it("fetch ném giá trị không phải Error → failed", async () => {
    const fetchImpl = fakeFetch(async () => {
      throw TOKEN;
    });
    await expect(revokeGoogleToken(TOKEN, fetchImpl)).resolves.toBe("failed");
  });

  it("gửi POST tới endpoint revoke, token ở body form, không ở URL, có signal", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const fetchImpl = fakeFetch(async () => jsonResponse(200, {}));

    await revokeGoogleToken(TOKEN, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [input, init] = fetchImpl.mock.calls[0];
    expect(String(input)).toBe(REVOKE_URL);
    expect(String(input)).not.toContain(TOKEN);
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Content-Type")).toBe(
      "application/x-www-form-urlencoded",
    );
    expect(init?.body).toBeInstanceOf(URLSearchParams);
    const body = init?.body as URLSearchParams;
    expect(body.get("token")).toBe(TOKEN);
    expect([...body.keys()]).toEqual(["token"]);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(timeoutSpy).toHaveBeenCalledWith(REVOKE_TIMEOUT_MS);
  });

  it("thời gian chờ 10 giây", () => {
    expect(REVOKE_TIMEOUT_MS).toBe(10_000);
  });
});

describe("buildDisconnectedAccountUpdate", () => {
  it("xoá 3 trường token, scope chỉ còn scope đăng nhập", () => {
    expect(buildDisconnectedAccountUpdate()).toEqual({
      access_token: null,
      refresh_token: null,
      expires_at: null,
      scope: GOOGLE_SIGN_IN_GRANTED_SCOPE,
    });
  });

  it("không đụng id_token hay trường khác", () => {
    expect(Object.keys(buildDisconnectedAccountUpdate()).sort()).toEqual(
      ["access_token", "expires_at", "refresh_token", "scope"].sort(),
    );
  });

  it("mỗi lần gọi trả object mới", () => {
    const first = buildDisconnectedAccountUpdate();
    const second = buildDisconnectedAccountUpdate();
    expect(first).not.toBe(second);
    (first as { scope: string }).scope = "mutated";
    expect(buildDisconnectedAccountUpdate().scope).toBe(GOOGLE_SIGN_IN_GRANTED_SCOPE);
  });
});
