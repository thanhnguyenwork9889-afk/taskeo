import { describe, expect, it } from "vitest";
import { DRIVE_NOT_CONNECTED_CODE } from "@/domain/drive-files";
import { ApiRequestError } from "./drive-files-api";
import { driveFilesViewState, type DriveFilesStateInput } from "./drive-files-state";

const BASE: DriveFilesStateInput = { isDemo: false, driveConnected: true, status: "success", error: null, count: 3 };

describe("driveFilesViewState", () => {
  it.each<[string, Partial<DriveFilesStateInput>, ReturnType<typeof driveFilesViewState>]>([
    ["demo thắng mọi thứ", { isDemo: true, driveConnected: false, status: "error", error: new Error("x") }, "demo"],
    ["demo khi đang tải", { isDemo: true, status: "pending" }, "demo"],
    ["chưa kết nối Drive", { driveConnected: false }, "connect"],
    ["chưa kết nối Drive dù đang tải", { driveConnected: false, status: "pending" }, "connect"],
    ["403 drive_not_connected", { status: "error", error: new ApiRequestError("x", 403, DRIVE_NOT_CONNECTED_CODE) }, "connect"],
    ["403 không có code → lỗi", { status: "error", error: new ApiRequestError("x", 403) }, "error"],
    ["code đúng nhưng status khác 403 → lỗi", { status: "error", error: new ApiRequestError("x", 400, DRIVE_NOT_CONNECTED_CODE) }, "error"],
    ["502", { status: "error", error: new ApiRequestError("x", 502) }, "error"],
    ["lỗi mạng", { status: "error", error: new TypeError("Failed to fetch") }, "error"],
    ["đang tải", { status: "pending", count: 0 }, "loading"],
    ["xong, rỗng", { count: 0 }, "empty"],
    ["xong, có file", { count: 3 }, "list"],
  ])("%s", (_label, override, expected) => {
    expect(driveFilesViewState({ ...BASE, ...override })).toBe(expected);
  });
});
