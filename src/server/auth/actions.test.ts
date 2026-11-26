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
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/server/auth/session", () => ({
  getApiUserId: mocks.getApiUserId,
  isAuthConfigured: mocks.isAuthConfigured,
}));
vi.mock("@/server/auth/auth", () => ({ auth: mocks.auth, signIn: mocks.signIn, signOut: mocks.signOut }));

import { connectGoogleDrive } from "./actions";

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
