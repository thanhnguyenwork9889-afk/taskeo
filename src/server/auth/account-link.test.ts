import { describe, expect, it } from "vitest";
import { shouldBlockAccountLink, type AccountLinkInput } from "@/server/auth/account-link";

const SELECTED_ID = "google-selected";
const OTHER_ID = "google-other";

function input(overrides: Partial<AccountLinkInput> = {}): AccountLinkInput {
  return {
    provider: "google",
    providerAccountId: SELECTED_ID,
    sessionUserId: "user-1",
    userGoogleAccountIds: [OTHER_ID],
    selectedAccountExists: false,
    ...overrides,
  };
}

describe("shouldBlockAccountLink", () => {
  it("allows when there is no session (first sign-in / sign-in again)", () => {
    expect(shouldBlockAccountLink(input({ sessionUserId: null }))).toBe(false);
  });

  it("allows when provider is not google", () => {
    expect(shouldBlockAccountLink(input({ provider: "github" }))).toBe(false);
  });

  it("allows when the selected account already exists in DB (Auth.js handles it)", () => {
    expect(shouldBlockAccountLink(input({ selectedAccountExists: true }))).toBe(false);
  });

  it("allows when the session user has no google account yet", () => {
    expect(shouldBlockAccountLink(input({ userGoogleAccountIds: [] }))).toBe(false);
  });

  it("allows when the session user only has the same google account", () => {
    expect(shouldBlockAccountLink(input({ userGoogleAccountIds: [SELECTED_ID] }))).toBe(false);
  });

  it("blocks when the session user has a different google account", () => {
    expect(shouldBlockAccountLink(input())).toBe(true);
  });

  it("blocks when the session user has both the same and a different google account (legacy data)", () => {
    expect(shouldBlockAccountLink(input({ userGoogleAccountIds: [SELECTED_ID, OTHER_ID] }))).toBe(true);
  });

  it("does not mutate its input", () => {
    const ids = [SELECTED_ID, OTHER_ID];
    const value = input({ userGoogleAccountIds: ids });
    const snapshot = structuredClone(value);
    Object.freeze(ids);
    Object.freeze(value);

    shouldBlockAccountLink(value);

    expect(value).toEqual(snapshot);
    expect(ids).toEqual([SELECTED_ID, OTHER_ID]);
  });
});
