import { describe, expect, it } from "vitest";
import {
  DRIVE_FOLDER_MIME,
  appPropertyQuery,
  escapeDriveQueryValue,
  rootFolderQuery,
} from "./drive-query";
import { escapeDriveQueryValue as domainEscape } from "@/domain/drive-files";

describe("escapeDriveQueryValue", () => {
  // Test đầy đủ ở src/domain/drive-files.test.ts; ở đây chỉ kiểm tra re-export.
  it("re-exports the domain function", () => {
    expect(escapeDriveQueryValue).toBe(domainEscape);
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
  it("đúng chuỗi trong spec (chỉ thư mục do chính user sở hữu)", () => {
    expect(rootFolderQuery()).toBe(
      "mimeType='application/vnd.google-apps.folder' and appProperties has { key='taskeoRole' and value='root' } and trashed=false and 'me' in owners",
    );
  });

  it("DRIVE_FOLDER_MIME là mime thư mục của Drive", () => {
    expect(DRIVE_FOLDER_MIME).toBe("application/vnd.google-apps.folder");
  });
});
