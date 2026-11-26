import { describe, expect, it } from "vitest";
import { GOOGLE_SCOPES, hasScope, parseScopes } from "./scopes";

const DRIVE = GOOGLE_SCOPES.drive;

describe("parseScopes", () => {
  it("tách theo một dấu cách", () => {
    expect(parseScopes(`openid ${DRIVE}`)).toEqual(["openid", DRIVE]);
  });

  it("bỏ khoảng trắng thừa, tab, xuống dòng ở đầu/giữa/cuối", () => {
    expect(parseScopes(`  openid \t\t${DRIVE}\n email  `)).toEqual(["openid", DRIVE, "email"]);
  });

  it("null / undefined / rỗng / chỉ khoảng trắng → []", () => {
    expect(parseScopes(null)).toEqual([]);
    expect(parseScopes(undefined)).toEqual([]);
    expect(parseScopes("")).toEqual([]);
    expect(parseScopes(" \t\n ")).toEqual([]);
  });
});

describe("hasScope", () => {
  it("có scope → true", () => {
    expect(hasScope(`openid ${DRIVE}`, DRIVE)).toBe(true);
  });

  it("scope ngăn bởi tab hoặc nhiều dấu cách → true", () => {
    expect(hasScope(`openid\t${DRIVE}`, DRIVE)).toBe(true);
    expect(hasScope(`openid   ${DRIVE}  `, DRIVE)).toBe(true);
  });

  it("null / undefined / rỗng → false", () => {
    expect(hasScope(null, DRIVE)).toBe(false);
    expect(hasScope(undefined, DRIVE)).toBe(false);
    expect(hasScope("", DRIVE)).toBe(false);
  });

  it("không khớp chuỗi con hay tiền tố", () => {
    expect(hasScope(`${DRIVE}.extra`, DRIVE)).toBe(false);
    expect(hasScope("https://www.googleapis.com/auth/drive", DRIVE)).toBe(false);
    expect(hasScope(`x${DRIVE}`, DRIVE)).toBe(false);
  });

  it("drive.file không suy ra drive đầy đủ", () => {
    expect(hasScope(DRIVE, "https://www.googleapis.com/auth/drive" as typeof DRIVE)).toBe(false);
  });
});
