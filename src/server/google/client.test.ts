import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type TokensHandler = (tokens: Record<string, unknown>) => void;

const db = vi.hoisted(() => ({
  account: { findFirst: vi.fn(), update: vi.fn() },
}));

const fake = vi.hoisted(() => {
  const state: { last: FakeOAuth2Instance | null } = { last: null };
  interface FakeOAuth2Instance {
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
    constructor() {
      state.last = this;
    }
  }
  return { state, FakeOAuth2 };
});

vi.mock("@/server/db", () => ({ prisma: db }));
vi.mock("googleapis", () => ({ google: { auth: { OAuth2: fake.FakeOAuth2 } } }));

import { decrypt, encrypt } from "@/server/crypto";
import { GoogleNotConnectedError, getGoogleAuth } from "./client";

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
  vi.restoreAllMocks();
});

describe("getGoogleAuth", () => {
  it("tìm account google theo userId", async () => {
    db.account.findFirst.mockResolvedValue(accountRow());

    await getGoogleAuth(USER);

    expect(db.account.findFirst).toHaveBeenCalledWith({ where: { userId: USER, provider: "google" } });
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

  it("đăng ký listener tokens", async () => {
    db.account.findFirst.mockResolvedValue(accountRow());

    await getGoogleAuth(USER);

    expect(lastClient().on).toHaveBeenCalledWith("tokens", expect.any(Function));
  });
});

describe("sự kiện tokens", () => {
  beforeEach(() => {
    db.account.findFirst.mockResolvedValue(accountRow());
    db.account.update.mockResolvedValue({});
  });

  function lastUpdateArgs() {
    const call = db.account.update.mock.calls[0];
    if (!call) throw new Error("account.update chưa được gọi");
    return call[0] as { where: unknown; data: Record<string, unknown> };
  }

  it("ghi access_token mã hoá và expires_at = floor(expiry_date / 1000), đúng where", async () => {
    await getGoogleAuth(USER);

    tokensHandler()({ access_token: "ya29.new-access", expiry_date: 1_900_000_000_999 });
    await vi.waitFor(() => expect(db.account.update).toHaveBeenCalledTimes(1));

    const { where, data } = lastUpdateArgs();
    expect(where).toEqual({
      provider_providerAccountId: { provider: "google", providerAccountId: PROVIDER_ACCOUNT_ID },
    });
    expect(typeof data.access_token).toBe("string");
    expect(data.access_token as string).toMatch(/^v1:/);
    expect(decrypt(data.access_token as string)).toBe("ya29.new-access");
    expect(data.expires_at).toBe(1_900_000_000);
  });

  it("không có refresh_token / scope thì không có key tương ứng", async () => {
    await getGoogleAuth(USER);

    tokensHandler()({ access_token: "ya29.new-access", expiry_date: 1_900_000_000_000 });
    await vi.waitFor(() => expect(db.account.update).toHaveBeenCalledTimes(1));

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
    await vi.waitFor(() => expect(db.account.update).toHaveBeenCalledTimes(1));

    const { data } = lastUpdateArgs();
    expect(data.refresh_token as string).toMatch(/^v1:/);
    expect(decrypt(data.refresh_token as string)).toBe("1//new-refresh");
    expect(data.scope).toBe("openid email profile");
  });

  it("lỗi DB: log userId + message, không chứa token gốc lẫn token đã mã hoá", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    db.account.update.mockRejectedValue(new Error("db down"));
    await getGoogleAuth(USER);

    tokensHandler()({ access_token: "ya29.secret-new", refresh_token: "1//secret-refresh", expiry_date: 1 });
    await vi.waitFor(() => expect(errorSpy).toHaveBeenCalledTimes(1));

    const args = errorSpy.mock.calls[0];
    expect(args?.[1]).toEqual({ userId: USER, message: "db down" });

    const updateData = lastUpdateArgs().data;
    const logged = JSON.stringify(args);
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
