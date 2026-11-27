import { describe, expect, it } from "vitest";
import { DRIVE_NOTICE_PARAM, cleanedLocation, driveNoticeFromParams, searchWithout } from "./drive-notice";

const WRONG_ACCOUNT_MESSAGE = "Bạn đã chọn tài khoản Google khác với tài khoản đang đăng nhập. Hãy chọn đúng tài khoản.";
const DISCONNECTED_MESSAGE = "Đã ngắt kết nối Google Drive.";
const DISCONNECT_FAILED_MESSAGE = "Không ngắt kết nối được Google Drive. Hãy thử lại.";
const DISCONNECTED_LOCAL_MESSAGE =
  "Đã xoá kết nối Google Drive khỏi Taskeo, nhưng quyền ở Google vẫn còn. Hãy gỡ quyền Taskeo ở trang Tài khoản Google (Bảo mật → Ứng dụng bên thứ ba).";

describe("driveNoticeFromParams", () => {
  it("uses the drive query param", () => {
    expect(DRIVE_NOTICE_PARAM).toBe("drive");
  });

  it("returns the wrong-account message for drive=wrong-account", () => {
    expect(driveNoticeFromParams(new URLSearchParams("drive=wrong-account"))).toBe(WRONG_ACCOUNT_MESSAGE);
  });

  // Phía server (src/server/auth/actions.ts) gắn đúng các chuỗi literal này, không import chéo lớp.
  it("returns the disconnected message for drive=disconnected", () => {
    expect(driveNoticeFromParams(new URLSearchParams("drive=disconnected"))).toBe(DISCONNECTED_MESSAGE);
  });

  it("returns the disconnect-failed message for drive=disconnect-failed", () => {
    expect(driveNoticeFromParams(new URLSearchParams("drive=disconnect-failed"))).toBe(DISCONNECT_FAILED_MESSAGE);
  });

  // Token không giải mã được: đã xoá ở Taskeo nhưng chưa thu hồi được quyền ở Google (R15).
  it("returns the disconnected-local message for drive=disconnected-local", () => {
    expect(driveNoticeFromParams(new URLSearchParams("drive=disconnected-local"))).toBe(DISCONNECTED_LOCAL_MESSAGE);
  });

  it("returns null for prototype keys", () => {
    expect(driveNoticeFromParams(new URLSearchParams("drive=toString"))).toBeNull();
    expect(driveNoticeFromParams(new URLSearchParams("drive=__proto__"))).toBeNull();
  });

  it("returns null for other values", () => {
    expect(driveNoticeFromParams(new URLSearchParams("drive=Disconnected"))).toBeNull();
    expect(driveNoticeFromParams(new URLSearchParams("drive=disconnect"))).toBeNull();
    expect(driveNoticeFromParams(new URLSearchParams("drive=connected"))).toBeNull();
    expect(driveNoticeFromParams(new URLSearchParams("drive=disconnected_local"))).toBeNull();
    expect(driveNoticeFromParams(new URLSearchParams("drive=local"))).toBeNull();
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

describe("cleanedLocation", () => {
  it("keeps a normal pathname and drops the drive param", () => {
    expect(cleanedLocation("/items", new URLSearchParams("type=task&drive=wrong-account"))).toBe("/items?type=task");
    expect(cleanedLocation("/", new URLSearchParams("drive=wrong-account"))).toBe("/");
  });

  it("falls back to / for protocol-relative pathnames", () => {
    expect(cleanedLocation("//evil.com/x", new URLSearchParams("drive=wrong-account&q=1"))).toBe("/?q=1");
    expect(cleanedLocation("/\\evil", new URLSearchParams("drive=wrong-account"))).toBe("/");
  });

  it("falls back to / for empty or relative pathnames", () => {
    expect(cleanedLocation("", new URLSearchParams("drive=wrong-account"))).toBe("/");
    expect(cleanedLocation("evil.com", new URLSearchParams("drive=wrong-account&q=1"))).toBe("/?q=1");
  });

  it("does not mutate the input", () => {
    const params = new URLSearchParams("type=task&drive=wrong-account");
    cleanedLocation("//evil.com", params);
    expect(params.toString()).toBe("type=task&drive=wrong-account");
  });
});
