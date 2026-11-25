import { describe, expect, it } from "vitest";
import { sessionWithUserId } from "./session-callback";

// Hình dạng thật Auth.js truyền vào callbacks.session với strategy "database":
// session = { ...AdapterSession, user: AdapterUser }, user = AdapterUser.
function makeInput() {
  const user = {
    id: "user-1",
    name: "Ada",
    email: "ada@example.com",
    image: "https://example.com/a.png",
    emailVerified: new Date("2026-01-01T00:00:00.000Z"),
    secretField: "should-not-leak",
  };
  const session = {
    sessionToken: "opaque-session-token",
    userId: "user-1",
    expires: new Date("2026-12-01T00:00:00.000Z"),
    user,
  };
  return { session, user };
}

describe("sessionWithUserId", () => {
  it("sets user.id from the adapter user", () => {
    const result = sessionWithUserId(makeInput());

    expect(result.user.id).toBe("user-1");
  });

  it("keeps name, email, image and expires (as ISO string)", () => {
    const result = sessionWithUserId(makeInput());

    expect(result).toEqual({
      user: { id: "user-1", name: "Ada", email: "ada@example.com", image: "https://example.com/a.png" },
      expires: "2026-12-01T00:00:00.000Z",
    });
  });

  it("keeps expires unchanged when it is already a string", () => {
    const input = makeInput();
    const result = sessionWithUserId({ ...input, session: { ...input.session, expires: "2027-01-01T00:00:00.000Z" } });

    expect(result.expires).toBe("2027-01-01T00:00:00.000Z");
  });

  it("does not copy extra user fields such as emailVerified", () => {
    const result = sessionWithUserId(makeInput());

    expect(Object.keys(result.user).sort()).toEqual(["email", "id", "image", "name"]);
    expect(result.user).not.toHaveProperty("emailVerified");
    expect(result.user).not.toHaveProperty("secretField");
  });

  it("does not expose session token or other adapter session fields", () => {
    const result = sessionWithUserId(makeInput());

    expect(Object.keys(result).sort()).toEqual(["expires", "user"]);
    expect(JSON.stringify(result)).not.toContain("opaque-session-token");
  });

  it("uses null for missing profile fields", () => {
    const input = makeInput();
    const result = sessionWithUserId({ session: { expires: input.session.expires, user: undefined }, user: { id: "user-2" } });

    expect(result.user).toEqual({ id: "user-2", name: null, email: null, image: null });
  });

  it("does not mutate its input", () => {
    const input = makeInput();
    const snapshot = structuredClone(input);

    sessionWithUserId(input);

    expect(input).toEqual(snapshot);
  });
});
