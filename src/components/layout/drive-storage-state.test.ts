import { describe, expect, it } from "vitest";
import { DRIVE_NOT_CONNECTED_CODE } from "@/domain/drive-files";
import { DriveStorageRequestError } from "./drive-storage-api";
import {
  driveStorageViewState,
  storageBarClass,
  storageBarWidth,
  storageTooltip,
  type DriveStorageStateInput,
} from "./drive-storage-state";

const BASE: DriveStorageStateInput = {
  isDemo: false,
  driveConnected: true,
  status: "success",
  error: null,
  hasData: true,
};

const NOT_CONNECTED = new DriveStorageRequestError("x", 403, DRIVE_NOT_CONNECTED_CODE);

describe("driveStorageViewState", () => {
  it("demo → hidden, kể cả khi có dữ liệu", () => {
    expect(driveStorageViewState({ ...BASE, isDemo: true })).toBe("hidden");
    expect(driveStorageViewState({ ...BASE, isDemo: true, driveConnected: false })).toBe("hidden");
  });

  it("chưa kết nối Drive → hidden", () => {
    expect(driveStorageViewState({ ...BASE, driveConnected: false, status: "pending", hasData: false })).toBe("hidden");
  });

  it("API báo 403 drive_not_connected → hidden, kể cả khi còn dữ liệu cũ", () => {
    expect(driveStorageViewState({ ...BASE, status: "error", error: NOT_CONNECTED, hasData: false })).toBe("hidden");
    expect(driveStorageViewState({ ...BASE, status: "error", error: NOT_CONNECTED, hasData: true })).toBe("hidden");
  });

  it("403 không có code drive_not_connected → error", () => {
    const error = new DriveStorageRequestError("x", 403);
    expect(driveStorageViewState({ ...BASE, status: "error", error, hasData: false })).toBe("error");
  });

  it("code drive_not_connected nhưng status khác 403 → error", () => {
    const error = new DriveStorageRequestError("x", 502, DRIVE_NOT_CONNECTED_CODE);
    expect(driveStorageViewState({ ...BASE, status: "error", error, hasData: false })).toBe("error");
  });

  it.each([
    ["502", new DriveStorageRequestError("x", 502)],
    ["401", new DriveStorageRequestError("x", 401)],
    ["lỗi mạng", new TypeError("Failed to fetch")],
  ])("lỗi %s khi chưa có dữ liệu → error", (_label, error) => {
    expect(driveStorageViewState({ ...BASE, status: "error", error, hasData: false })).toBe("error");
  });

  it("pending → loading", () => {
    expect(driveStorageViewState({ ...BASE, status: "pending", hasData: false })).toBe("loading");
  });

  it("success → ready", () => {
    expect(driveStorageViewState(BASE)).toBe("ready");
  });

  it("refetch nền lỗi mà còn dữ liệu cũ → ready", () => {
    const error = new DriveStorageRequestError("x", 502);
    expect(driveStorageViewState({ ...BASE, status: "error", error, hasData: true })).toBe("ready");
  });
});

describe("storageBarClass", () => {
  it("normal → bg-brand, warning → hổ phách, danger → đỏ", () => {
    expect(storageBarClass("normal")).toBe("bg-brand");
    expect(storageBarClass("warning")).toMatch(/^bg-amber-/);
    expect(storageBarClass("danger")).toMatch(/^bg-red-/);
  });
});

describe("storageBarWidth", () => {
  it("0 → 0%", () => {
    expect(storageBarWidth(0)).toBe("0%");
  });

  it("> 0 nhưng rất nhỏ → tối thiểu 2% để thấy được", () => {
    expect(storageBarWidth(0.01)).toBe("2%");
    expect(storageBarWidth(1.5)).toBe("2%");
  });

  it("giữ nguyên phần trăm, kẹp ở 100", () => {
    expect(storageBarWidth(21.3)).toBe("21.3%");
    expect(storageBarWidth(100)).toBe("100%");
    expect(storageBarWidth(140)).toBe("100%");
  });

  it("âm / NaN → 0%", () => {
    expect(storageBarWidth(-5)).toBe("0%");
    expect(storageBarWidth(Number.NaN)).toBe("0%");
  });
});

describe("storageTooltip", () => {
  it("ghi dung lượng trong Drive và thùng rác", () => {
    const storage = { usage: 0, limit: null, usageInDrive: 1536, usageInDriveTrash: 0 };
    expect(storageTooltip(storage)).toBe("Trong Drive: 1,5 KB · Thùng rác: 0 B");
  });

  it("không đổi object đầu vào", () => {
    const storage = Object.freeze({ usage: 1, limit: 2, usageInDrive: 1024 ** 3, usageInDriveTrash: 850 * 1024 ** 2 });
    expect(storageTooltip(storage)).toBe("Trong Drive: 1 GB · Thùng rác: 850 MB");
  });
});
