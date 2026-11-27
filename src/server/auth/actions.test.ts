import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  getApiUserId: vi.fn(),
  isAuthConfigured: vi.fn(() => true),
  auth: vi.fn(),
  signIn: vi.fn<(...args: unknown[]) => Promise<undefined>>(async () => undefined),
  signOut: vi.fn(async () => undefined),
  refresh: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(async () => ({})),
  revokeGoogleToken: vi.fn<(token: string) => Promise<"revoked" | "already-invalid" | "failed">>(),
  decrypt: vi.fn((payload: string) => {
    if (!payload.startsWith("enc:")) throw new Error(`Token đã mã hoá không đúng định dạng: ${payload}`);
    return payload.slice("enc:".length);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/server/auth/session", () => ({
  getApiUserId: mocks.getApiUserId,
  isAuthConfigured: mocks.isAuthConfigured,
}));
vi.mock("@/server/auth/auth", () => ({ auth: mocks.auth, signIn: mocks.signIn, signOut: mocks.signOut }));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));
vi.mock("@/server/db", () => ({
  prisma: { account: { findFirst: mocks.findFirst, update: mocks.update } },
}));
vi.mock("@/server/crypto", () => ({ decrypt: mocks.decrypt }));
vi.mock("@/server/google/revoke", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/google/revoke")>();
  return { ...actual, revokeGoogleToken: mocks.revokeGoogleToken };
});

import { connectGoogleDrive, disconnectGoogleDrive, signInWithGoogle } from "./actions";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

function form(redirectTo?: string): FormData {
  const data = new FormData();
  if (redirectTo !== undefined) data.set("redirectTo", redirectTo);
  return data;
}

function signedIn(email: string | null = "an@example.com") {
  mocks.getApiUserId.mockResolvedValue({ ok: true, userId: "user-1" });
  mocks.auth.mockResolvedValue({ user: { id: "user-1", email }, expires: "2099-01-01" });
}

describe("connectGoogleDrive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to / without signIn when auth is not configured (demo / misconfigured)", async () => {
    mocks.getApiUserId.mockResolvedValue({ ok: false, status: 503 });

    await expect(connectGoogleDrive(form("/docs"))).rejects.toThrow("NEXT_REDIRECT:/");
    expect(mocks.redirect).toHaveBeenCalledWith("/");
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("redirects to /login without signIn when signed out", async () => {
    mocks.getApiUserId.mockResolvedValue({ ok: false, status: 401 });

    await expect(connectGoogleDrive(form("/docs"))).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("asks Google for drive.file on top of the sign-in scopes, with offline + consent and login_hint", async () => {
    signedIn();

    await connectGoogleDrive(form("/spaces/s1?tab=docs"));

    expect(mocks.signIn).toHaveBeenCalledTimes(1);
    expect(mocks.signIn).toHaveBeenCalledWith(
      "google",
      { redirectTo: "/spaces/s1?tab=docs" },
      {
        scope: `openid email profile ${DRIVE_SCOPE}`,
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "true",
        login_hint: "an@example.com",
      },
    );
  });

  it("omits login_hint when the session has no email", async () => {
    signedIn(null);

    await connectGoogleDrive(form("/docs"));

    const params = mocks.signIn.mock.calls[0]?.[2] as Record<string, string>;
    expect(params).not.toHaveProperty("login_hint");
    expect(params.scope).toContain(DRIVE_SCOPE);
  });

  it.each(["https://evil.com", "//evil.com", "/\\evil.com"])("replaces external redirectTo %s with /", async (value) => {
    signedIn();

    await connectGoogleDrive(form(value));

    expect(mocks.signIn).toHaveBeenCalledWith("google", { redirectTo: "/" }, expect.any(Object));
  });

  it("defaults redirectTo to / when the form has none", async () => {
    signedIn();

    await connectGoogleDrive(form());

    expect(mocks.signIn).toHaveBeenCalledWith("google", { redirectTo: "/" }, expect.any(Object));
  });
});

function signInForm(connectDrive?: string): FormData {
  const data = new FormData();
  if (connectDrive !== undefined) data.set("connectDrive", connectDrive);
  return data;
}

describe("signInWithGoogle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAuthConfigured.mockReturnValue(true);
  });

  it("asks for drive.file with offline + consent + include_granted_scopes when connectDrive is 'on'", async () => {
    await signInWithGoogle(signInForm("on"));

    expect(mocks.signIn).toHaveBeenCalledTimes(1);
    expect(mocks.signIn).toHaveBeenCalledWith(
      "google",
      { redirectTo: "/" },
      {
        scope: `openid email profile ${DRIVE_SCOPE}`,
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "true",
      },
    );
  });

  it.each([
    ["missing", undefined],
    ["'true'", "true"],
    ["'ON'", "ON"],
    ["empty", ""],
  ])("uses the plain sign-in (no third argument) when connectDrive is %s", async (_label, value) => {
    await signInWithGoogle(signInForm(value));

    expect(mocks.signIn).toHaveBeenCalledTimes(1);
    expect(mocks.signIn.mock.calls[0]).toEqual(["google", { redirectTo: "/" }]);
  });

  it("redirects to / without signIn when auth is not configured (demo / misconfigured)", async () => {
    mocks.isAuthConfigured.mockReturnValue(false);

    await expect(signInWithGoogle(signInForm("on"))).rejects.toThrow("NEXT_REDIRECT:/");
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
});

// Chuỗi literal phải khớp DRIVE_NOTICES trong src/components/layout/drive-notice.ts.
const DISCONNECTED = "disconnected";
const DISCONNECT_FAILED = "disconnect-failed";

const SIGN_IN_ONLY_SCOPE =
  "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile";

const PLAIN_REFRESH = "1//plain-refresh-token-SECRET";
const PLAIN_ACCESS = "ya29.plain-access-token-SECRET";

const CONSOLE_METHODS = ["log", "info", "warn", "error", "debug"] as const;

interface StoredAccount {
  providerAccountId: string;
  refresh_token: string | null;
  access_token: string | null;
}

function storedAccount(overrides: Partial<StoredAccount> = {}): StoredAccount {
  return {
    providerAccountId: "google-sub-1",
    refresh_token: `enc:${PLAIN_REFRESH}`,
    access_token: `enc:${PLAIN_ACCESS}`,
    ...overrides,
  };
}

/** Chạy action, trả đích redirect (redirect giả ném "NEXT_REDIRECT:<url>"). */
async function runDisconnect(...args: [redirectTo?: string]): Promise<string> {
  const redirectTo = args.length === 0 ? "/docs" : args[0];
  try {
    await disconnectGoogleDrive(form(redirectTo));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("NEXT_REDIRECT:")) return message.slice("NEXT_REDIRECT:".length);
    throw error;
  }
  throw new Error("disconnectGoogleDrive did not redirect");
}

function expectDisconnectedUpdate() {
  expect(mocks.update).toHaveBeenCalledTimes(1);
  expect(mocks.update).toHaveBeenCalledWith({
    where: { provider_providerAccountId: { provider: "google", providerAccountId: "google-sub-1" } },
    data: { access_token: null, refresh_token: null, expires_at: null, scope: SIGN_IN_ONLY_SCOPE },
  });
}

describe("disconnectGoogleDrive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getApiUserId.mockResolvedValue({ ok: true, userId: "user-1" });
    mocks.findFirst.mockResolvedValue(storedAccount());
    mocks.update.mockResolvedValue({});
    mocks.revokeGoogleToken.mockResolvedValue("revoked");
  });

  it("redirects to / without touching the DB when auth is not configured (demo / misconfigured)", async () => {
    mocks.getApiUserId.mockResolvedValue({ ok: false, status: 503 });

    expect(await runDisconnect()).toBe("/");
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.revokeGoogleToken).not.toHaveBeenCalled();
  });

  it("redirects to /login without touching the DB when signed out", async () => {
    mocks.getApiUserId.mockResolvedValue({ ok: false, status: 401 });

    expect(await runDisconnect()).toBe("/login");
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("reads the user's google Account in GOOGLE_ACCOUNT_ORDER, selecting only the needed columns", async () => {
    await runDisconnect();

    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-1", provider: "google" },
      orderBy: { createdAt: "asc" },
      select: { providerAccountId: true, refresh_token: true, access_token: true },
    });
  });

  it.each(["revoked", "already-invalid"] as const)(
    "on %s: clears tokens, refreshes and redirects back with drive=disconnected",
    async (result) => {
      mocks.revokeGoogleToken.mockResolvedValue(result);

      const target = await runDisconnect("/docs");

      expectDisconnectedUpdate();
      expect(mocks.refresh).toHaveBeenCalledTimes(1);
      expect(target).toBe(`/docs?drive=${DISCONNECTED}`);
    },
  );

  it("revokes the decrypted refresh token in preference to the access token", async () => {
    await runDisconnect();

    expect(mocks.decrypt).toHaveBeenCalledTimes(1);
    expect(mocks.decrypt).toHaveBeenCalledWith(`enc:${PLAIN_REFRESH}`);
    expect(mocks.revokeGoogleToken).toHaveBeenCalledWith(PLAIN_REFRESH);
  });

  it("falls back to the decrypted access token when there is no refresh token", async () => {
    mocks.findFirst.mockResolvedValue(storedAccount({ refresh_token: null }));

    await runDisconnect();

    expect(mocks.decrypt).toHaveBeenCalledWith(`enc:${PLAIN_ACCESS}`);
    expect(mocks.revokeGoogleToken).toHaveBeenCalledWith(PLAIN_ACCESS);
  });

  it("treats an Account without tokens as already disconnected: no Google call, still updates", async () => {
    mocks.findFirst.mockResolvedValue(storedAccount({ refresh_token: null, access_token: null }));

    const target = await runDisconnect("/docs");

    expect(mocks.decrypt).not.toHaveBeenCalled();
    expect(mocks.revokeGoogleToken).not.toHaveBeenCalled();
    expectDisconnectedUpdate();
    expect(target).toBe(`/docs?drive=${DISCONNECTED}`);
  });

  it("does not update and reports disconnect-failed when Google revoke fails", async () => {
    mocks.revokeGoogleToken.mockResolvedValue("failed");

    const target = await runDisconnect("/docs");

    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(target).toBe(`/docs?drive=${DISCONNECT_FAILED}`);
  });

  it("reports disconnect-failed without writing when the user has no google Account", async () => {
    mocks.findFirst.mockResolvedValue(null);

    const target = await runDisconnect("/docs");

    expect(mocks.revokeGoogleToken).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(target).toBe(`/docs?drive=${DISCONNECT_FAILED}`);
  });

  it("clears tokens without calling Google when decrypt throws (nothing readable to revoke)", async () => {
    mocks.findFirst.mockResolvedValue(storedAccount({ refresh_token: "corrupted-SECRET-payload" }));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const target = await runDisconnect("/docs");

    expect(mocks.revokeGoogleToken).not.toHaveBeenCalled();
    expectDisconnectedUpdate();
    expect(target).toBe(`/docs?drive=${DISCONNECTED}`);
    expect(errorSpy).toHaveBeenCalledWith(expect.any(String), { userId: "user-1", error: "Error" });
    errorSpy.mockRestore();
  });

  it("reports disconnect-failed when decrypt throws and the DB update also fails", async () => {
    mocks.findFirst.mockResolvedValue(storedAccount({ refresh_token: "corrupted-SECRET-payload" }));
    mocks.update.mockRejectedValue(new Error("write failed"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const target = await runDisconnect("/docs");

    expect(mocks.revokeGoogleToken).not.toHaveBeenCalled();
    expect(target).toBe(`/docs?drive=${DISCONNECT_FAILED}`);
    errorSpy.mockRestore();
  });

  it("reports disconnect-failed without writing and logs only userId + error name when findFirst throws", async () => {
    mocks.findFirst.mockRejectedValue(
      Object.assign(new Error(`read failed ${PLAIN_REFRESH}`), { name: "PrismaClientInitializationError" }),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const target = await runDisconnect("/docs");

    expect(mocks.revokeGoogleToken).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(target).toBe(`/docs?drive=${DISCONNECT_FAILED}`);
    expect(errorSpy).toHaveBeenCalledWith(expect.any(String), {
      userId: "user-1",
      error: "PrismaClientInitializationError",
    });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(PLAIN_REFRESH);
    errorSpy.mockRestore();
  });

  it("reports disconnect-failed and logs only userId + error name when the DB update throws", async () => {
    mocks.update.mockRejectedValue(
      Object.assign(new Error(`write failed ${PLAIN_REFRESH}`), { name: "PrismaClientKnownRequestError" }),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const target = await runDisconnect("/docs");

    expect(target).toBe(`/docs?drive=${DISCONNECT_FAILED}`);
    expect(errorSpy).toHaveBeenCalledWith(expect.any(String), {
      userId: "user-1",
      error: "PrismaClientKnownRequestError",
    });
    errorSpy.mockRestore();
  });

  it.each(["https://evil.com", "//evil.com", "/\\evil.com"])("replaces external redirectTo %s with /", async (value) => {
    expect(await runDisconnect(value)).toBe(`/?drive=${DISCONNECTED}`);
  });

  it("defaults to / when the form has no redirectTo", async () => {
    expect(await runDisconnect(undefined)).toBe(`/?drive=${DISCONNECTED}`);
  });

  it("keeps the existing query of redirectTo and replaces an old drive value", async () => {
    expect(await runDisconnect("/spaces/s1?tab=docs&drive=wrong-account")).toBe(
      `/spaces/s1?tab=docs&drive=${DISCONNECTED}`,
    );
  });

  it.each([
    ["revoke failed", () => mocks.revokeGoogleToken.mockResolvedValue("failed")],
    ["decrypt threw", () => mocks.findFirst.mockResolvedValue(storedAccount({ refresh_token: `bad:${PLAIN_REFRESH}` }))],
    ["update threw", () => mocks.update.mockRejectedValue(new Error(`boom ${PLAIN_REFRESH} ${PLAIN_ACCESS}`))],
    ["findFirst threw", () => mocks.findFirst.mockRejectedValue(new Error(`boom ${PLAIN_REFRESH} ${PLAIN_ACCESS}`))],
    ["success", () => undefined],
  ])("never writes a token to the console (%s)", async (_label, arrange) => {
    arrange();
    const spies = CONSOLE_METHODS.map((method) => vi.spyOn(console, method).mockImplementation(() => undefined));

    await runDisconnect();

    const logged = JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
    expect(logged).not.toContain(PLAIN_REFRESH);
    expect(logged).not.toContain(PLAIN_ACCESS);
    expect(logged).not.toContain("SECRET");
    spies.forEach((spy) => spy.mockRestore());
  });
});
