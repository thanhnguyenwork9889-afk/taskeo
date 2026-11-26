import { describe, expect, it } from "vitest";
import { DRIVE_NOTICE_PARAM, driveNoticeFromParams, searchWithout } from "./drive-notice";

const WRONG_ACCOUNT_MESSAGE = "Bạn đã chọn tài khoản Google khác với tài khoản đang đăng nhập. Hãy chọn đúng tài khoản.";

describe("driveNoticeFromParams", () => {
  it("uses the drive query param", () => {
    expect(DRIVE_NOTICE_PARAM).toBe("drive");
  });

  it("returns the wrong-account message for drive=wrong-account", () => {
    expect(driveNoticeFromParams(new URLSearchParams("drive=wrong-account"))).toBe(WRONG_ACCOUNT_MESSAGE);
  });

  it("returns null for other values", () => {
    expect(driveNoticeFromParams(new URLSearchParams("drive=connected"))).toBeNull();
    expect(driveNoticeFromParams(new URLSearchParams("drive="))).toBeNull();
    expect(driveNoticeFromParams(new URLSearchParams("drive=%20wrong-account%20"))).toBeNull();
  });

  it("returns null when the param is missing", () => {
    expect(driveNoticeFromParams(new URLSearchParams(""))).toBeNull();
    expect(driveNoticeFromParams(new URLSearchParams("type=task"))).toBeNull();
  });
});

describe("searchWithout", () => {
  it("drops the key and keeps other params in order, with a leading ?", () => {
    const params = new URLSearchParams("type=task&drive=wrong-account&q=a%20b");
    expect(searchWithout(params, "drive")).toBe("?type=task&q=a+b");
  });

  it("returns an empty string when only the key was present", () => {
    expect(searchWithout(new URLSearchParams("drive=wrong-account"), "drive")).toBe("");
  });

  it("returns an empty string for empty params", () => {
    expect(searchWithout(new URLSearchParams(""), "drive")).toBe("");
  });

  it("drops every occurrence of a repeated key", () => {
    expect(searchWithout(new URLSearchParams("drive=a&x=1&drive=b"), "drive")).toBe("?x=1");
  });

  it("does not mutate the input", () => {
    const params = new URLSearchParams("type=task&drive=wrong-account");
    searchWithout(params, "drive");
    expect(params.toString()).toBe("type=task&drive=wrong-account");
  });
});
