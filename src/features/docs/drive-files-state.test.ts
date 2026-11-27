import { describe, expect, it } from "vitest";
import { DRIVE_NOT_CONNECTED_CODE } from "@/domain/drive-files";
import { ApiRequestError } from "./drive-files-api";
import { driveFilesErrorInfo, driveFilesViewState, driveFileSubtitle, type DriveFilesStateInput } from "./drive-files-state";

const BASE: DriveFilesStateInput = { isDemo: false, driveConnected: true, status: "success", error: null, hasData: true, count: 3 };

describe("driveFilesViewState", () => {
  it.each<[string, Partial<DriveFilesStateInput>, ReturnType<typeof driveFilesViewState>]>([
    ["demo thắng mọi thứ", { isDemo: true, driveConnected: false, status: "error", error: new Error("x") }, "demo"],
    ["demo khi đang tải", { isDemo: true, status: "pending" }, "demo"],
    ["chưa kết nối Drive", { driveConnected: false }, "connect"],
    ["chưa kết nối Drive dù đang tải", { driveConnected: false, status: "pending" }, "connect"],
    ["403 drive_not_connected", { status: "error", error: new ApiRequestError("x", 403, DRIVE_NOT_CONNECTED_CODE) }, "connect"],
    ["403 không có code → lỗi", { status: "error", error: new ApiRequestError("x", 403), hasData: false }, "error"],
    ["code đúng nhưng status khác 403 → lỗi", { status: "error", error: new ApiRequestError("x", 400, DRIVE_NOT_CONNECTED_CODE), hasData: false }, "error"],
    ["502", { status: "error", error: new ApiRequestError("x", 502), hasData: false, count: 0 }, "error"],
    ["lỗi mạng", { status: "error", error: new TypeError("Failed to fetch"), hasData: false, count: 0 }, "error"],
    ["refetch nền lỗi, vẫn còn dữ liệu có file → giữ danh sách", { status: "error", error: new ApiRequestError("x", 502), count: 2 }, "list"],
    ["refetch nền lỗi, dữ liệu cũ rỗng → giữ rỗng", { status: "error", error: new TypeError("Failed to fetch"), count: 0 }, "empty"],
    ["refetch nền 403 drive_not_connected dù còn dữ liệu → connect", { status: "error", error: new ApiRequestError("x", 403, DRIVE_NOT_CONNECTED_CODE) }, "connect"],
    ["đang tải", { status: "pending", hasData: false, count: 0 }, "loading"],
    ["xong, rỗng", { count: 0 }, "empty"],
    ["xong, có file", { count: 3 }, "list"],
  ])("%s", (_label, override, expected) => {
    expect(driveFilesViewState({ ...BASE, ...override })).toBe(expected);
  });
});

describe("driveFilesErrorInfo", () => {
  it("401 → báo hết phiên, không cho thử lại", () => {
    const info = driveFilesErrorInfo(new ApiRequestError("Chưa đăng nhập", 401));
    expect(info.canRetry).toBe(false);
    expect(info.message).toBe("Phiên đăng nhập đã hết hạn, hãy tải lại trang để đăng nhập lại.");
  });

  it.each([400, 403, 404])("4xx khác (%i) → hiện thông điệp của API, không cho thử lại", (status) => {
    const info = driveFilesErrorInfo(new ApiRequestError("Tham số không hợp lệ", status));
    expect(info).toMatchObject({ canRetry: false, message: "Tham số không hợp lệ" });
  });

  it("4xx với thông điệp toàn khoảng trắng → dùng câu mặc định không hứa thử lại", () => {
    const info = driveFilesErrorInfo(new ApiRequestError("   ", 400));
    expect(info.canRetry).toBe(false);
    expect(info.message.trim().length).toBeGreaterThan(0);
  });

  it.each<[string, unknown]>([
    ["502", new ApiRequestError("Google lỗi", 502)],
    ["200 sai hình dạng", new ApiRequestError("x", 200)],
    ["lỗi mạng", new TypeError("Failed to fetch")],
    ["null", null],
  ])("%s → câu chung, cho thử lại", (_label, error) => {
    const info = driveFilesErrorInfo(error);
    expect(info.canRetry).toBe(true);
    expect(info.message).toMatch(/thử lại/);
  });
});

describe("driveFileSubtitle", () => {
  it("dự án · không gian", () => {
    expect(driveFileSubtitle({ projectName: "Ra mắt", spaceName: "Công việc" })).toBe("Ra mắt · Công việc");
  });
  it("không có dự án → chỉ tên không gian", () => {
    expect(driveFileSubtitle({ projectName: null, spaceName: "Cá nhân" })).toBe("Cá nhân");
  });
  it("bỏ tên rỗng", () => {
    expect(driveFileSubtitle({ projectName: "", spaceName: "" })).toBe("");
  });
});
