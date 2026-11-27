import { describe, expect, it } from "vitest";
import {
  DRIVE_FOLDER_MIME,
  appPropertyQuery,
  escapeDriveQueryValue,
  rootFolderQuery,
} from "./drive-query";

describe("escapeDriveQueryValue", () => {
  it("giữ nguyên chuỗi thường và tiếng Việt", () => {
    expect(escapeDriveQueryValue("Không gian 1")).toBe("Không gian 1");
    expect(escapeDriveQueryValue("")).toBe("");
  });

  it("thoát dấu nháy đơn", () => {
    expect(escapeDriveQueryValue("it's")).toBe("it\\'s");
  });

  it("thoát dấu gạch chéo ngược", () => {
    expect(escapeDriveQueryValue("a\\b")).toBe("a\\\\b");
  });

  it("thoát \\ trước ' (không thoát hai lần)", () => {
    // Đầu vào: \'  → \\\'
    expect(escapeDriveQueryValue("\\'")).toBe("\\\\\\'");
    expect(escapeDriveQueryValue("'\\")).toBe("\\'\\\\");
  });

  it("không thể thoát khỏi chuỗi bằng ' or ...", () => {
    const out = escapeDriveQueryValue("x' or trashed=true or name='y");
    expect(out).toBe("x\\' or trashed=true or name=\\'y");
    // Mọi ' đều có \ đứng trước.
    expect(/(^|[^\\])'/.test(out)).toBe(false);
  });
});

describe("appPropertyQuery", () => {
  it("dựng điều kiện appProperties", () => {
    expect(appPropertyQuery("taskeoRole", "root")).toBe(
      "appProperties has { key='taskeoRole' and value='root' }",
    );
  });

  it("thoát cả key và value", () => {
    expect(appPropertyQuery("k'1", "v\\'2")).toBe(
      "appProperties has { key='k\\'1' and value='v\\\\\\'2' }",
    );
  });
});

describe("rootFolderQuery", () => {
  it("đúng chuỗi trong spec", () => {
    expect(rootFolderQuery()).toBe(
      "mimeType='application/vnd.google-apps.folder' and appProperties has { key='taskeoRole' and value='root' } and trashed=false",
    );
  });

  it("DRIVE_FOLDER_MIME là mime thư mục của Drive", () => {
    expect(DRIVE_FOLDER_MIME).toBe("application/vnd.google-apps.folder");
  });
});
