import { describe, expect, it } from "vitest";
import {
  STORAGE_USED_LABEL,
  formatBytes,
  formatStorageUsage,
  parseStorageQuota,
  storageLevel,
  storagePercent,
  type RawStorageQuota,
} from "./drive-storage";
import type { DriveStorage } from "./types";

const GB = 1024 ** 3;

const FULL: RawStorageQuota = {
  limit: "16106127360",
  usage: "3435973837",
  usageInDrive: "1073741824",
  usageInDriveTrash: "1024",
};

function storage(overrides: Partial<DriveStorage> = {}): DriveStorage {
  return { usage: 0, limit: 100, usageInDrive: 0, usageInDriveTrash: 0, ...overrides };
}

describe("parseStorageQuota", () => {
  it("chuyển chuỗi int64 hợp lệ thành số byte", () => {
    expect(parseStorageQuota(FULL)).toEqual({
      limit: 16106127360,
      usage: 3435973837,
      usageInDrive: 1073741824,
      usageInDriveTrash: 1024,
    });
  });

  it("không sửa object đầu vào", () => {
    const raw = { ...FULL };
    parseStorageQuota(raw);
    expect(raw).toEqual(FULL);
  });

  it("null / undefined → null", () => {
    expect(parseStorageQuota(null)).toBeNull();
    expect(parseStorageQuota(undefined)).toBeNull();
  });

  it.each([
    ["vắng", undefined],
    ["null", null],
    ["chuỗi rỗng", ""],
    ["0", "0"],
  ])("limit %s → không giới hạn (null)", (_name, limit) => {
    expect(parseStorageQuota({ ...FULL, limit })?.limit).toBeNull();
  });

  it("usageInDrive / usageInDriveTrash vắng → 0", () => {
    expect(parseStorageQuota({ usage: "5" })).toEqual({
      usage: 5,
      limit: null,
      usageInDrive: 0,
      usageInDriveTrash: 0,
    });
  });

  it("usage = '0' hợp lệ", () => {
    expect(parseStorageQuota({ usage: "0", limit: "10" })?.usage).toBe(0);
  });

  it.each([
    ["vắng", undefined],
    ["null", null],
    ["rỗng", ""],
    ["khoảng trắng", "   "],
  ])("usage %s → null", (_name, usage) => {
    expect(parseStorageQuota({ ...FULL, usage })).toBeNull();
  });

  const BAD = ["-1", "1.5", "abc", "1e3", " 12", "12 ", "+5", "9007199254740992", "99999999999999999999"];

  it.each(BAD)("usage sai định dạng %j → null", (value) => {
    expect(parseStorageQuota({ ...FULL, usage: value })).toBeNull();
  });

  it.each(BAD)("limit sai định dạng %j → null", (value) => {
    expect(parseStorageQuota({ ...FULL, limit: value })).toBeNull();
  });

  it.each(BAD)("usageInDrive sai định dạng %j → null", (value) => {
    expect(parseStorageQuota({ ...FULL, usageInDrive: value })).toBeNull();
  });

  it.each(BAD)("usageInDriveTrash sai định dạng %j → null", (value) => {
    expect(parseStorageQuota({ ...FULL, usageInDriveTrash: value })).toBeNull();
  });

  it("usageInDrive chuỗi rỗng → null (có mặt nhưng sai)", () => {
    expect(parseStorageQuota({ ...FULL, usageInDrive: "" })).toBeNull();
  });

  it("chấp nhận số lớn nhất an toàn", () => {
    expect(parseStorageQuota({ usage: "9007199254740991" })?.usage).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe("storagePercent", () => {
  it("không giới hạn → null", () => {
    expect(storagePercent(storage({ limit: null, usage: 5 }))).toBeNull();
  });

  it("usage / limit * 100, không làm tròn", () => {
    expect(storagePercent(storage({ usage: 1, limit: 3 }))).toBeCloseTo(33.3333, 3);
    expect(storagePercent(storage({ usage: 25, limit: 100 }))).toBe(25);
  });

  it("kẹp 100 khi usage > limit", () => {
    expect(storagePercent(storage({ usage: 250, limit: 100 }))).toBe(100);
  });

  it("usage 0 → 0", () => {
    expect(storagePercent(storage({ usage: 0, limit: 100 }))).toBe(0);
  });

  it("limit 0 (dựng tay) → null, không chia cho 0", () => {
    expect(storagePercent(storage({ usage: 5, limit: 0 }))).toBeNull();
  });
});

describe("storageLevel", () => {
  it.each([
    [null, "normal"],
    [0, "normal"],
    [74.99, "normal"],
    [75, "warning"],
    [89.99, "warning"],
    [90, "danger"],
    [100, "danger"],
  ] as const)("%s → %s", (percent, level) => {
    expect(storageLevel(percent)).toBe(level);
  });
});

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [1, "1 B"],
    [1023, "1023 B"],
    [1024, "1 KB"],
    [1536, "1,5 KB"],
    [10 * 1024, "10 KB"],
    [850 * 1024 ** 2, "850 MB"],
    [1.5 * GB, "1,5 GB"],
    [3.25 * GB, "3,3 GB"],
    [3.2 * GB, "3,2 GB"],
    [15 * GB, "15 GB"],
    [2 * 1024 ** 4, "2 TB"],
    [2048 * 1024 ** 4, "2048 TB"],
    [1023.96 * 1024, "1 MB"],
    [9.96 * 1024, "10 KB"],
    [10.4 * 1024, "10 KB"],
    [1023.6, "1 KB"],
  ])("%d → %s", (bytes, text) => {
    expect(formatBytes(bytes)).toBe(text);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])("%d → 0 B", (bytes) => {
    expect(formatBytes(bytes)).toBe("0 B");
  });
});

describe("formatStorageUsage", () => {
  it("có giới hạn → 'Đã dùng X / Y'", () => {
    expect(formatStorageUsage(storage({ usage: 3.2 * GB, limit: 15 * GB }))).toBe("Đã dùng 3,2 GB / 15 GB");
  });

  it("không giới hạn → 'Đã dùng X'", () => {
    expect(formatStorageUsage(storage({ usage: 850 * 1024 ** 2, limit: null }))).toBe("Đã dùng 850 MB");
  });

  it("dùng nhãn chung", () => {
    expect(STORAGE_USED_LABEL).toBe("Đã dùng");
  });
});
