import { describe, expect, it } from "vitest";
import {
  MAX_REDIRECT_PATH_LENGTH,
  toSafeRedirectPath,
  withQueryParam,
} from "@/server/auth/redirect-path";

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

describe("withQueryParam", () => {
  it("adds the param to the root path", () => {
    expect(withQueryParam("/", "drive", "x")).toBe("/?drive=x");
  });

  it("appends after existing query params, keeping their order", () => {
    expect(withQueryParam("/spaces/1?tab=docs", "drive", "x")).toBe("/spaces/1?tab=docs&drive=x");
  });

  it("replaces an existing value of the same key and keeps other params", () => {
    expect(withQueryParam("/a?drive=old&b=1", "drive", "x")).toBe("/a?drive=x&b=1");
  });

  it("keeps the hash after the query", () => {
    expect(withQueryParam("/a#h", "drive", "x")).toBe("/a?drive=x#h");
    expect(withQueryParam("/a?b=1#h", "drive", "x")).toBe("/a?b=1&drive=x#h");
  });

  it.each([
    ["absolute URL", "https://evil.com"],
    ["protocol-relative URL", "//evil"],
    ["slash-backslash", "/\\evil"],
    ["null", null],
    ["undefined", undefined],
    ["number", 42],
  ])("falls back to /?drive=x for unsafe input (%s)", (_label, value) => {
    expect(withQueryParam(value, "drive", "x")).toBe("/?drive=x");
  });

  it.each(["/.//evil", "/a/..//evil", "/%2e//evil", "/./%2e//evil?b=1"])(
    "falls back to / when URL normalization would produce // (%s)",
    (value) => {
      expect(withQueryParam(value, "drive", "x")).toBe("/?drive=x");
    },
  );

  it("encodes special characters in the value", () => {
    const result = withQueryParam("/a", "drive", "a b&c=d#e/?");
    expect(result).toBe("/a?drive=a+b%26c%3Dd%23e%2F%3F");
    expect(new URL(result, "http://internal").searchParams.get("drive")).toBe("a b&c=d#e/?");
  });

  it.each(["/", "/a?b=1#h", "https://evil.com", "//evil", "/.//evil", null])(
    "always returns a path starting with exactly one / (%j)",
    (value) => {
      const result = withQueryParam(value, "drive", "x");
      expect(result.startsWith("/")).toBe(true);
      expect(result.startsWith("//")).toBe(false);
    },
  );
});
