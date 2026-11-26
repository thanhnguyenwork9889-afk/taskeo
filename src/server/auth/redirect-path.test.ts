import { describe, expect, it } from "vitest";
import { MAX_REDIRECT_PATH_LENGTH, toSafeRedirectPath } from "@/server/auth/redirect-path";

describe("toSafeRedirectPath", () => {
  it.each(["/", "/spaces/1?x=1", "/projects/abc#files", "/tasks?status=TODO&q=a%20b"])(
    "keeps internal path %s",
    (path) => {
      expect(toSafeRedirectPath(path)).toBe(path);
    },
  );

  it.each([
    ["absolute URL", "https://evil.com"],
    ["protocol-relative URL", "//evil.com"],
    ["slash-backslash", "/\\evil.com"],
    ["backslash inside", "/a\\b"],
    ["newline", "/a\nb"],
    ["tab", "/a\tb"],
    ["NUL", "/a\u0000b"],
    ["DEL", "/a\u007Fb"],
    ["relative path", "spaces/1"],
    ["javascript URL", "javascript:alert(1)"],
    ["empty string", ""],
  ])("falls back to / for %s", (_label, value) => {
    expect(toSafeRedirectPath(value)).toBe("/");
  });

  it.each([null, undefined, 123, {}, ["/a"]])("falls back to / for non-string %j", (value) => {
    expect(toSafeRedirectPath(value)).toBe("/");
  });

  it("accepts a path at the length limit and rejects one past it", () => {
    const atLimit = "/" + "a".repeat(MAX_REDIRECT_PATH_LENGTH - 1);
    expect(toSafeRedirectPath(atLimit)).toBe(atLimit);
    expect(toSafeRedirectPath(atLimit + "a")).toBe("/");
  });
});
