import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthMode: vi.fn(),
  missingAuthEnvVars: vi.fn(() => [] as string[]),
  auth: vi.fn(),
}));

vi.mock("@/config/env", () => ({
  getAuthMode: mocks.getAuthMode,
  missingAuthEnvVars: mocks.missingAuthEnvVars,
}));

vi.mock("@/server/auth/auth", () => ({ auth: mocks.auth }));

import { getApiUserId } from "./session";

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
