import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { AUTH_SESSION_COOKIE_NAMES } from "./auth-cookies";

/** Phần tối thiểu của `defaultCookies` trong @auth/core mà test cần. */
type DefaultCookies = (useSecureCookies: boolean) => { sessionToken: { name: string } };

/**
 * `@auth/core/lib/utils/cookie` không nằm trong exports map của @auth/core, và @auth/core chỉ là
 * dependency của next-auth. Nên resolve @auth/core từ thư mục của next-auth (đúng bản app chạy),
 * rồi import thẳng file lib/utils/cookie.js.
 */
async function loadDefaultCookies(): Promise<DefaultCookies> {
  const require = createRequire(import.meta.url);
  const nextAuthEntry = require.resolve("next-auth");
  const coreEntry = require.resolve("@auth/core", { paths: [path.dirname(nextAuthEntry)] });
  const cookieFile = path.join(path.dirname(coreEntry), "lib", "utils", "cookie.js");
  const mod = (await import(/* @vite-ignore */ pathToFileURL(cookieFile).href)) as {
    defaultCookies: DefaultCookies;
  };
  return mod.defaultCookies;
}

describe("AUTH_SESSION_COOKIE_NAMES", () => {
  it("lists the secure cookie first, matching Auth.js defaults with useSecureCookies=true", async () => {
    const defaultCookies = await loadDefaultCookies();
    expect(defaultCookies(true).sessionToken.name).toBe(AUTH_SESSION_COOKIE_NAMES[0]);
  });

  it("lists the plain cookie second, matching Auth.js defaults with useSecureCookies=false", async () => {
    const defaultCookies = await loadDefaultCookies();
    expect(defaultCookies(false).sessionToken.name).toBe(AUTH_SESSION_COOKIE_NAMES[1]);
  });

  it("contains exactly the two default session cookie names", () => {
    expect(AUTH_SESSION_COOKIE_NAMES).toHaveLength(2);
  });
});
