import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieValues: new Map<string, string>(),
  sessionFindUnique: vi.fn(),
  accountFindMany: vi.fn(),
  accountCreate: vi.fn(),
  accountUpdate: vi.fn(),
  accountUpsert: vi.fn(),
  sessionCreate: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = mocks.cookieValues.get(name);
      return value === undefined ? undefined : { name, value };
    },
  }),
}));

vi.mock("@/server/db", () => ({
  prisma: {
    session: { findUnique: mocks.sessionFindUnique, create: mocks.sessionCreate },
    account: {
      findMany: mocks.accountFindMany,
      create: mocks.accountCreate,
      update: mocks.accountUpdate,
      upsert: mocks.accountUpsert,
    },
  },
}));

import {
  WRONG_ACCOUNT_REDIRECT,
  findGoogleAccountsForLink,
  guardSignIn,
  readSessionUserId,
} from "./account-link-data";

const SECURE_COOKIE = "__Secure-authjs.session-token";
const PLAIN_COOKIE = "authjs.session-token";
const SESSION_USER = "user-1";
const SELECTED_ID = "google-selected";
const OTHER_ID = "google-other";

const googleAccount = { account: { provider: "google", providerAccountId: SELECTED_ID } };

function signedIn(token = "tok-plain", cookieName = PLAIN_COOKIE) {
  mocks.cookieValues.set(cookieName, token);
  mocks.sessionFindUnique.mockResolvedValue({ userId: SESSION_USER });
}

function expectNoWrites() {
  expect(mocks.accountCreate).not.toHaveBeenCalled();
  expect(mocks.accountUpdate).not.toHaveBeenCalled();
  expect(mocks.accountUpsert).not.toHaveBeenCalled();
  expect(mocks.sessionCreate).not.toHaveBeenCalled();
}

describe("WRONG_ACCOUNT_REDIRECT", () => {
  it("points to the home page with the drive=wrong-account notice", () => {
    expect(WRONG_ACCOUNT_REDIRECT).toBe("/?drive=wrong-account");
  });
});

describe("readSessionUserId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookieValues.clear();
  });

  it("returns null without querying when there is no session cookie", async () => {
    await expect(readSessionUserId()).resolves.toBeNull();
    expect(mocks.sessionFindUnique).not.toHaveBeenCalled();
  });

  it("looks up the plain cookie token and returns the userId", async () => {
    signedIn("tok-plain");

    await expect(readSessionUserId()).resolves.toBe(SESSION_USER);
    expect(mocks.sessionFindUnique).toHaveBeenCalledWith({
      where: { sessionToken: "tok-plain" },
      select: { userId: true },
    });
  });

  it("prefers the __Secure- cookie when both are present", async () => {
    mocks.cookieValues.set(PLAIN_COOKIE, "tok-plain");
    mocks.cookieValues.set(SECURE_COOKIE, "tok-secure");
    mocks.sessionFindUnique.mockResolvedValue({ userId: SESSION_USER });

    await readSessionUserId();
    expect(mocks.sessionFindUnique).toHaveBeenCalledWith({
      where: { sessionToken: "tok-secure" },
      select: { userId: true },
    });
  });

  it("returns null when the session row does not exist", async () => {
    signedIn();
    mocks.sessionFindUnique.mockResolvedValue(null);

    await expect(readSessionUserId()).resolves.toBeNull();
  });

  it("propagates DB errors", async () => {
    signedIn();
    mocks.sessionFindUnique.mockRejectedValue(new Error("db down"));

    await expect(readSessionUserId()).rejects.toThrow("db down");
  });
});

describe("findGoogleAccountsForLink", () => {
  beforeEach(() => vi.clearAllMocks());

  it("runs a single findMany with the expected where/select", async () => {
    mocks.accountFindMany.mockResolvedValue([]);

    await findGoogleAccountsForLink(SELECTED_ID, SESSION_USER);
    expect(mocks.accountFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.accountFindMany).toHaveBeenCalledWith({
      where: { provider: "google", OR: [{ providerAccountId: SELECTED_ID }, { userId: SESSION_USER }] },
      select: { userId: true, providerAccountId: true },
    });
  });
});

describe("guardSignIn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookieValues.clear();
  });

  it("allows without any query when account is missing", async () => {
    await expect(guardSignIn({})).resolves.toBe(true);
    await expect(guardSignIn({ account: null })).resolves.toBe(true);
    expect(mocks.sessionFindUnique).not.toHaveBeenCalled();
    expect(mocks.accountFindMany).not.toHaveBeenCalled();
  });

  it("allows without any query for a non-google provider", async () => {
    signedIn();

    await expect(guardSignIn({ account: { provider: "github", providerAccountId: "x" } })).resolves.toBe(true);
    expect(mocks.sessionFindUnique).not.toHaveBeenCalled();
    expect(mocks.accountFindMany).not.toHaveBeenCalled();
  });

  it("allows without querying accounts when there is no session cookie", async () => {
    await expect(guardSignIn(googleAccount)).resolves.toBe(true);
    expect(mocks.accountFindMany).not.toHaveBeenCalled();
  });

  it("allows without querying accounts when the session row is missing", async () => {
    signedIn();
    mocks.sessionFindUnique.mockResolvedValue(null);

    await expect(guardSignIn(googleAccount)).resolves.toBe(true);
    expect(mocks.accountFindMany).not.toHaveBeenCalled();
  });

  it("blocks and writes nothing when the user already has a different google account", async () => {
    signedIn();
    mocks.accountFindMany.mockResolvedValue([{ userId: SESSION_USER, providerAccountId: OTHER_ID }]);

    await expect(guardSignIn(googleAccount)).resolves.toBe(WRONG_ACCOUNT_REDIRECT);
    expectNoWrites();
  });

  it("allows when the user signs in with the same google account", async () => {
    signedIn();
    mocks.accountFindMany.mockResolvedValue([{ userId: SESSION_USER, providerAccountId: SELECTED_ID }]);

    await expect(guardSignIn(googleAccount)).resolves.toBe(true);
  });

  it("allows when the session user has no google account yet", async () => {
    signedIn();
    mocks.accountFindMany.mockResolvedValue([]);

    await expect(guardSignIn(googleAccount)).resolves.toBe(true);
  });

  it("allows when the selected account already exists in DB (Auth.js handles it)", async () => {
    signedIn();
    mocks.accountFindMany.mockResolvedValue([
      { userId: SESSION_USER, providerAccountId: OTHER_ID },
      { userId: "user-2", providerAccountId: SELECTED_ID },
    ]);

    await expect(guardSignIn(googleAccount)).resolves.toBe(true);
  });

  it("rejects when the account query fails", async () => {
    signedIn();
    mocks.accountFindMany.mockRejectedValue(new Error("db down"));

    await expect(guardSignIn(googleAccount)).rejects.toThrow("db down");
  });

  it("rejects when the session query fails", async () => {
    signedIn();
    mocks.sessionFindUnique.mockRejectedValue(new Error("db down"));

    await expect(guardSignIn(googleAccount)).rejects.toThrow("db down");
    expect(mocks.accountFindMany).not.toHaveBeenCalled();
  });
});
