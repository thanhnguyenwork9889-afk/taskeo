import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";

type TokensHandler = (tokens: Record<string, unknown>) => void;

const db = vi.hoisted(() => ({
  account: { findFirst: vi.fn(), updateMany: vi.fn() },
}));

const fake = vi.hoisted(() => {
  const state: { last: FakeOAuth2Instance | null } = { last: null };
  interface FakeOAuth2Instance {
    options: unknown[];
    setCredentials: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    handlers: Map<string, (tokens: Record<string, unknown>) => void>;
  }
  class FakeOAuth2 implements FakeOAuth2Instance {
    handlers = new Map<string, (tokens: Record<string, unknown>) => void>();
    setCredentials = vi.fn();
    on = vi.fn((event: string, handler: (tokens: Record<string, unknown>) => void) => {
      this.handlers.set(event, handler);
      return this;
    });
    options: unknown[];
    constructor(...options: unknown[]) {
      this.options = options;
      state.last = this;
    }
  }
  return { state, FakeOAuth2 };
});

vi.mock("@/server/db", () => ({ prisma: db }));
vi.mock("googleapis", () => ({ google: { auth: { OAuth2: fake.FakeOAuth2 } } }));

import { decrypt, encrypt } from "@/server/crypto";
import { GOOGLE_HTTP_TIMEOUT_MS, GoogleNotConnectedError, getGoogleAuth } from "./client";

const USER = "user-1";
const PROVIDER_ACCOUNT_ID = "google-sub-123";
const ACCESS = "ya29.access-plain";
const REFRESH = "1//refresh-plain";
const EXPIRES_AT = 1_800_000_000;

function lastClient() {
  const client = fake.state.last;
  if (!client) throw new Error("OAuth2 chưa được khởi tạo");
  return client;
}

function tokensHandler(): TokensHandler {
  const handler = lastClient().handlers.get("tokens");
  if (!handler) throw new Error("Chưa đăng ký listener tokens");
  return handler;
}

function accountRow(overrides: Record<string, unknown> = {}) {
  return {
    providerAccountId: PROVIDER_ACCOUNT_ID,
    access_token: encrypt(ACCESS),
    refresh_token: encrypt(REFRESH),
    expires_at: EXPIRES_AT,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  fake.state.last = null;
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getGoogleAuth", () => {
  it("tìm account google theo userId, thứ tự xác định giống granted-scopes", async () => {
    db.account.findFirst.mockResolvedValue(accountRow());

    await getGoogleAuth(USER);

    expect(db.account.findFirst).toHaveBeenCalledTimes(1);
    expect(db.account.findFirst).toHaveBeenCalledWith({
      where: { userId: USER, provider: "google" },
      orderBy: { createdAt: "asc" },
    });
  });

  it("ném GoogleNotConnectedError khi không có account", async () => {
    db.account.findFirst.mockResolvedValue(null);

    await expect(getGoogleAuth(USER)).rejects.toBeInstanceOf(GoogleNotConnectedError);
    expect(fake.state.last).toBeNull();
  });

  it("ném GoogleNotConnectedError khi refresh_token null", async () => {
    db.account.findFirst.mockResolvedValue(accountRow({ refresh_token: null }));

    await expect(getGoogleAuth(USER)).rejects.toBeInstanceOf(GoogleNotConnectedError);
    expect(fake.state.last).toBeNull();
  });

  it("setCredentials nhận token đã giải mã và expiry_date = expires_at * 1000", async () => {
    db.account.findFirst.mockResolvedValue(accountRow());

    const client = await getGoogleAuth(USER);

    expect(client).toBe(lastClient());
    expect(lastClient().setCredentials).toHaveBeenCalledWith({
      access_token: ACCESS,
      refresh_token: REFRESH,
      expiry_date: EXPIRES_AT * 1000,
    });
  });

  it("thiếu access_token và expires_at thì truyền undefined", async () => {
    db.account.findFirst.mockResolvedValue(accountRow({ access_token: null, expires_at: null }));

    await getGoogleAuth(USER);

    expect(lastClient().setCredentials).toHaveBeenCalledWith({
      access_token: undefined,
      refresh_token: REFRESH,
      expiry_date: undefined,
    });
  });

  it("khởi tạo OAuth2 dạng options với clientId, clientSecret và timeout HTTP", async () => {
    vi.stubEnv("AUTH_GOOGLE_ID", "client-id.apps.googleusercontent.com");
    vi.stubEnv("AUTH_GOOGLE_SECRET", "client-secret-value");
    db.account.findFirst.mockResolvedValue(accountRow());

    await getGoogleAuth(USER);

    expect(lastClient().options).toEqual([
      {
        clientId: "client-id.apps.googleusercontent.com",
        clientSecret: "client-secret-value",
        transporterOptions: { timeout: GOOGLE_HTTP_TIMEOUT_MS },
      },
    ]);
  });

  it("GOOGLE_HTTP_TIMEOUT_MS là số dương hữu hạn, không quá 30 s", () => {
    expect(Number.isFinite(GOOGLE_HTTP_TIMEOUT_MS)).toBe(true);
    expect(GOOGLE_HTTP_TIMEOUT_MS).toBeGreaterThan(0);
    expect(GOOGLE_HTTP_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
  });

  it("đăng ký listener tokens", async () => {
    db.account.findFirst.mockResolvedValue(accountRow());

    await getGoogleAuth(USER);

    expect(lastClient().on).toHaveBeenCalledWith("tokens", expect.any(Function));
  });
});

describe("sự kiện tokens", () => {
  beforeEach(() => {
    db.account.findFirst.mockResolvedValue(accountRow());
    db.account.updateMany.mockResolvedValue({ count: 1 });
  });

  function lastUpdateArgs() {
    const call = db.account.updateMany.mock.calls[0];
    if (!call) throw new Error("account.updateMany chưa được gọi");
    return call[0] as { where: unknown; data: Record<string, unknown> };
  }

  it("ghi access_token mã hoá và expires_at = floor(expiry_date / 1000), where có điều kiện refresh_token not null", async () => {
    await getGoogleAuth(USER);

    tokensHandler()({ access_token: "ya29.new-access", expiry_date: 1_900_000_000_999 });
    await vi.waitFor(() => expect(db.account.updateMany).toHaveBeenCalledTimes(1));

    const { where, data } = lastUpdateArgs();
    expect(where).toEqual({
      provider: "google",
      providerAccountId: PROVIDER_ACCOUNT_ID,
      refresh_token: { not: null },
    });
    expect(typeof data.access_token).toBe("string");
    expect(data.access_token as string).toMatch(/^v1:/);
    expect(decrypt(data.access_token as string)).toBe("ya29.new-access");
    expect(data.expires_at).toBe(1_900_000_000);
  });

  it("không có refresh_token / scope thì không có key tương ứng", async () => {
    await getGoogleAuth(USER);

    tokensHandler()({ access_token: "ya29.new-access", expiry_date: 1_900_000_000_000 });
    await vi.waitFor(() => expect(db.account.updateMany).toHaveBeenCalledTimes(1));

    const { data } = lastUpdateArgs();
    expect(data).not.toHaveProperty("refresh_token");
    expect(data).not.toHaveProperty("scope");
    expect(Object.keys(data).sort()).toEqual(["access_token", "expires_at"]);
  });

  it("có refresh_token và scope thì ghi refresh_token mã hoá và scope", async () => {
    await getGoogleAuth(USER);

    tokensHandler()({
      access_token: "ya29.new-access",
      refresh_token: "1//new-refresh",
      expiry_date: 1_900_000_000_000,
      scope: "openid email profile",
    });
    await vi.waitFor(() => expect(db.account.updateMany).toHaveBeenCalledTimes(1));

    const { data } = lastUpdateArgs();
    expect(data.refresh_token as string).toMatch(/^v1:/);
    expect(decrypt(data.refresh_token as string)).toBe("1//new-refresh");
    expect(data.scope).toBe("openid email profile");
  });

  it("0 dòng được cập nhật (đã ngắt Drive): không ném, không log", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    onTestFinished(() => {
      errorSpy.mockRestore();
      warnSpy.mockRestore();
      logSpy.mockRestore();
    });
    db.account.updateMany.mockResolvedValue({ count: 0 });
    await getGoogleAuth(USER);

    expect(() =>
      tokensHandler()({
        access_token: "ya29.late-access",
        refresh_token: "1//late-refresh",
        expiry_date: 1_900_000_000_000,
        scope: "openid email profile https://www.googleapis.com/auth/drive.file",
      }),
    ).not.toThrow();
    await vi.waitFor(() => expect(db.account.updateMany).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(lastUpdateArgs().where).toMatchObject({ refresh_token: { not: null } });
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("lỗi DB: log userId + error.name, không có message, không chứa token gốc lẫn token đã mã hoá", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    onTestFinished(() => errorSpy.mockRestore());
    const dbError = new Error("db down ya29.secret-new 1//secret-refresh");
    dbError.name = "PrismaClientKnownRequestError";
    db.account.updateMany.mockRejectedValue(dbError);
    await getGoogleAuth(USER);

    tokensHandler()({
      access_token: "ya29.secret-new",
      refresh_token: "1//secret-refresh",
      expiry_date: 1_900_000_000_000,
    });
    await vi.waitFor(() => expect(db.account.updateMany).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(errorSpy).toHaveBeenCalledTimes(1));

    const args = errorSpy.mock.calls[0];
    expect(args?.[1]).toEqual({ userId: USER, error: "PrismaClientKnownRequestError" });

    const updateData = lastUpdateArgs().data;
    const logged = JSON.stringify(args);
    expect(logged).not.toContain("db down");
    for (const secret of [
      "ya29.secret-new",
      "1//secret-refresh",
      updateData.access_token as string,
      updateData.refresh_token as string,
    ]) {
      expect(logged).not.toContain(secret);
    }
  });
});
