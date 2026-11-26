import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthMode: vi.fn(),
  missingAuthEnvVars: vi.fn(() => [] as string[]),
  auth: vi.fn(),
  connection: vi.fn(async () => undefined),
  hasGoogleScope: vi.fn(async () => false),
}));

vi.mock("@/server/google/granted-scopes", () => ({ hasGoogleScope: mocks.hasGoogleScope }));

vi.mock("next/server", () => ({ connection: mocks.connection }));

vi.mock("@/config/env", () => ({
  getAuthMode: mocks.getAuthMode,
  missingAuthEnvVars: mocks.missingAuthEnvVars,
}));

vi.mock("@/server/auth/auth", () => ({ auth: mocks.auth }));

import { getApiUserId, getViewer } from "./session";

describe("getApiUserId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns 503 in demo mode without calling auth", async () => {
    mocks.getAuthMode.mockReturnValue("demo");

    await expect(getApiUserId()).resolves.toEqual({ ok: false, status: 503 });
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it("returns 503 in misconfigured mode without calling auth and logs only missing var names", async () => {
    mocks.getAuthMode.mockReturnValue("misconfigured");
    mocks.missingAuthEnvVars.mockReturnValue(["AUTH_SECRET"]);

    await expect(getApiUserId()).resolves.toEqual({ ok: false, status: 503 });
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(expect.any(String), { missing: ["AUTH_SECRET"] });
  });

  it("returns 401 when there is no session", async () => {
    mocks.getAuthMode.mockReturnValue("configured");
    mocks.auth.mockResolvedValue(null);

    await expect(getApiUserId()).resolves.toEqual({ ok: false, status: 401 });
  });

  it("returns 401 when the session user has no id", async () => {
    mocks.getAuthMode.mockReturnValue("configured");
    mocks.auth.mockResolvedValue({ user: { name: "A", email: "a@example.com" }, expires: "2099-01-01" });

    await expect(getApiUserId()).resolves.toEqual({ ok: false, status: 401 });
  });

  it("returns 401 when the session has no user", async () => {
    mocks.getAuthMode.mockReturnValue("configured");
    mocks.auth.mockResolvedValue({ expires: "2099-01-01" });

    await expect(getApiUserId()).resolves.toEqual({ ok: false, status: 401 });
  });

  it("returns the user id when signed in", async () => {
    mocks.getAuthMode.mockReturnValue("configured");
    mocks.auth.mockResolvedValue({ user: { id: "user-1", name: "A" }, expires: "2099-01-01" });

    await expect(getApiUserId()).resolves.toEqual({ ok: true, userId: "user-1" });
    expect(mocks.auth).toHaveBeenCalledTimes(1);
  });

  it("propagates errors from auth instead of swallowing them", async () => {
    mocks.getAuthMode.mockReturnValue("configured");
    mocks.auth.mockRejectedValue(new Error("db down"));

    await expect(getApiUserId()).rejects.toThrow("db down");
  });
});

describe("getViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns the demo viewer in demo mode without connection() or auth", async () => {
    mocks.getAuthMode.mockReturnValue("demo");

    await expect(getViewer()).resolves.toMatchObject({ isDemo: true, driveConnected: false });
    expect(mocks.connection).not.toHaveBeenCalled();
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.hasGoogleScope).not.toHaveBeenCalled();
  });

  it("returns null in misconfigured mode without auth", async () => {
    mocks.getAuthMode.mockReturnValue("misconfigured");

    await expect(getViewer()).resolves.toBeNull();
    expect(mocks.connection).not.toHaveBeenCalled();
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  // auth() tạo CSRF token bằng crypto.getRandomValues() khi chưa có cookie; với cacheComponents
  // giá trị ngẫu nhiên phải nằm sau connection(), nếu không prerender báo blocking-prerender-crypto.
  it("awaits connection() before calling auth in configured mode", async () => {
    mocks.getAuthMode.mockReturnValue("configured");
    const order: string[] = [];
    mocks.connection.mockImplementationOnce(async () => {
      order.push("connection");
    });
    mocks.auth.mockImplementationOnce(async () => {
      order.push("auth");
      return { user: { id: "u1", name: "An", email: "an@example.com", image: null }, expires: "2099-01-01" };
    });

    await expect(getViewer()).resolves.toEqual({
      name: "An",
      email: "an@example.com",
      image: null,
      isDemo: false,
      driveConnected: false,
    });
    expect(order).toEqual(["connection", "auth"]);
  });

  it("returns null when signed out in configured mode without checking scopes", async () => {
    mocks.getAuthMode.mockReturnValue("configured");
    mocks.auth.mockResolvedValue(null);

    await expect(getViewer()).resolves.toBeNull();
    expect(mocks.connection).toHaveBeenCalledTimes(1);
    expect(mocks.hasGoogleScope).not.toHaveBeenCalled();
  });

  it("sets driveConnected from the drive.file scope of the signed-in user", async () => {
    mocks.getAuthMode.mockReturnValue("configured");
    mocks.auth.mockResolvedValue({ user: { id: "user-7", name: "An" }, expires: "2099-01-01" });
    mocks.hasGoogleScope.mockResolvedValueOnce(true);

    await expect(getViewer()).resolves.toMatchObject({ driveConnected: true });
    expect(mocks.hasGoogleScope).toHaveBeenCalledWith("user-7", "https://www.googleapis.com/auth/drive.file");
  });

  it("sets driveConnected false when the scope is missing", async () => {
    mocks.getAuthMode.mockReturnValue("configured");
    mocks.auth.mockResolvedValue({ user: { id: "user-7", name: "An" }, expires: "2099-01-01" });
    mocks.hasGoogleScope.mockResolvedValueOnce(false);

    await expect(getViewer()).resolves.toMatchObject({ driveConnected: false });
  });

  it("sets driveConnected false without a scope query when the session user has no id", async () => {
    mocks.getAuthMode.mockReturnValue("configured");
    mocks.auth.mockResolvedValue({ user: { name: "An" }, expires: "2099-01-01" });

    await expect(getViewer()).resolves.toMatchObject({ driveConnected: false });
    expect(mocks.hasGoogleScope).not.toHaveBeenCalled();
  });

  it("exposes only the five viewer fields (no scope string or tokens)", async () => {
    mocks.getAuthMode.mockReturnValue("configured");
    mocks.auth.mockResolvedValue({
      user: { id: "user-7", name: "An", email: "an@example.com", image: null, scope: "x", access_token: "t" },
      expires: "2099-01-01",
    });
    mocks.hasGoogleScope.mockResolvedValueOnce(true);

    const viewer = await getViewer();
    expect(Object.keys(viewer ?? {}).sort()).toEqual(["driveConnected", "email", "image", "isDemo", "name"]);
  });

  it("propagates scope lookup errors like auth() errors", async () => {
    mocks.getAuthMode.mockReturnValue("configured");
    mocks.auth.mockResolvedValue({ user: { id: "user-7", name: "An" }, expires: "2099-01-01" });
    mocks.hasGoogleScope.mockRejectedValueOnce(new Error("db down"));

    await expect(getViewer()).rejects.toThrow("db down");
  });
});
