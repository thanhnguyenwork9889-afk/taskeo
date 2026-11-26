import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Account } from "next-auth";
import type { AdapterAccount } from "next-auth/adapters";
import { decrypt } from "@/server/crypto";
import {
  GOOGLE_AUTHORIZATION_PARAMS,
  buildReSignInTokenUpdate,
  encryptAdapterAccountTokens,
} from "@/server/auth/google-tokens";

function adapterAccount(overrides: Partial<AdapterAccount> = {}): AdapterAccount {
  return {
    userId: "user-1",
    type: "oidc",
    provider: "google",
    providerAccountId: "g-123",
    access_token: "access-plain",
    refresh_token: "refresh-plain",
    id_token: "id-plain",
    expires_at: 1_800_000_000,
    scope: "openid email profile",
    token_type: "bearer",
    ...overrides,
  };
}

function account(overrides: Partial<Account> = {}): Account {
  return {
    type: "oidc",
    provider: "google",
    providerAccountId: "g-123",
    access_token: "access-plain",
    refresh_token: "refresh-plain",
    id_token: "id-plain",
    expires_at: 1_800_000_000,
    scope: "openid email profile",
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GOOGLE_AUTHORIZATION_PARAMS", () => {
  it("chỉ xin scope đăng nhập, offline + consent + include_granted_scopes", () => {
    expect(GOOGLE_AUTHORIZATION_PARAMS).toEqual({
      scope: "openid email profile",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
    });
  });
});

describe("encryptAdapterAccountTokens", () => {
  it("mã hoá access/refresh/id token sang dạng v1: và giải mã về giá trị gốc", () => {
    const result = encryptAdapterAccountTokens(adapterAccount());

    for (const [field, plain] of [
      ["access_token", "access-plain"],
      ["refresh_token", "refresh-plain"],
      ["id_token", "id-plain"],
    ] as const) {
      const value = result[field];
      expect(typeof value).toBe("string");
      expect(value).toMatch(/^v1:/);
      expect(decrypt(value as string)).toBe(plain);
    }
  });

  it("giữ nguyên các field khác", () => {
    const result = encryptAdapterAccountTokens(adapterAccount());
    expect(result).toMatchObject({
      userId: "user-1",
      type: "oidc",
      provider: "google",
      providerAccountId: "g-123",
      expires_at: 1_800_000_000,
      scope: "openid email profile",
      token_type: "bearer",
    });
  });

  it("token vắng thành undefined (không phải null)", () => {
    const result = encryptAdapterAccountTokens(
      adapterAccount({ access_token: undefined, refresh_token: undefined, id_token: undefined }),
    );
    expect(result.access_token).toBeUndefined();
    expect(result.refresh_token).toBeUndefined();
    expect(result.id_token).toBeUndefined();
  });

  it("không mutate input", () => {
    const input = adapterAccount();
    const snapshot = { ...input };
    const result = encryptAdapterAccountTokens(input);
    expect(input).toEqual(snapshot);
    expect(result).not.toBe(input);
  });
});

describe("buildReSignInTokenUpdate", () => {
  it("trả null khi account null", () => {
    expect(buildReSignInTokenUpdate(null)).toBeNull();
  });

  it("trả null khi provider không phải google", () => {
    expect(buildReSignInTokenUpdate(account({ provider: "github" }))).toBeNull();
  });

  it("trả null khi thiếu access_token", () => {
    expect(buildReSignInTokenUpdate(account({ access_token: undefined }))).toBeNull();
  });

  it("mã hoá access/refresh/id token (khứ hồi được)", () => {
    const data = buildReSignInTokenUpdate(account());
    expect(data).not.toBeNull();
    expect(data?.access_token).toMatch(/^v1:/);
    expect(data?.refresh_token).toMatch(/^v1:/);
    expect(data?.id_token).toMatch(/^v1:/);
    expect(decrypt(data?.access_token as string)).toBe("access-plain");
    expect(decrypt(data?.refresh_token as string)).toBe("refresh-plain");
    expect(decrypt(data?.id_token as string)).toBe("id-plain");
  });

  it("bỏ hẳn key refresh_token, id_token, expires_at, scope khi vắng", () => {
    const data = buildReSignInTokenUpdate(
      account({ refresh_token: undefined, id_token: undefined, expires_at: undefined, scope: undefined }),
    );
    expect(data).not.toBeNull();
    expect(data).toHaveProperty("access_token");
    expect(data).not.toHaveProperty("refresh_token");
    expect(data).not.toHaveProperty("id_token");
    expect(data).not.toHaveProperty("expires_at");
    expect(data).not.toHaveProperty("scope");
  });

  it("chép nguyên expires_at và scope", () => {
    const data = buildReSignInTokenUpdate(account({ expires_at: 1_900_000_000, scope: "openid email" }));
    expect(data?.expires_at).toBe(1_900_000_000);
    expect(data?.scope).toBe("openid email");
  });
});
