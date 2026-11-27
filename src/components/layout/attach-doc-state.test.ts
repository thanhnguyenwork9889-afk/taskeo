import { describe, expect, it } from "vitest";
import {
  ALREADY_ATTACHED_CODE,
  DRIVE_NOT_CONNECTED_CODE,
  INVALID_TARGET_CODE,
  PICKER_NOT_CONFIGURED_CODE,
} from "@/domain/drive-files";
import {
  attachButtonLabel,
  attachDialogState,
  attachErrorMessage,
  canDismissAttach,
  isAttachBusy,
  PICKER_INVALID_MESSAGE,
} from "./attach-doc-state";
import { CREATE_DOC_TIMEOUT_CODE, CreateDocRequestError } from "./create-doc-api";
import { PickerLoadError } from "./google-picker";

describe("attachDialogState", () => {
  it.each([
    [false, "success", 3, "connect"],
    [false, "pending", 0, "connect"],
    [true, "pending", 0, "loading"],
    [true, "error", 0, "error"],
    [true, "success", 0, "no_spaces"],
    [true, "success", 2, "ready"],
  ] as const)("driveConnected=%s, %s, %i không gian → %s", (driveConnected, spacesStatus, spaceCount, expected) => {
    expect(attachDialogState({ driveConnected, spacesStatus, spaceCount })).toBe(expected);
  });
});

const err = (status: number, code?: string) => new CreateDocRequestError("technical detail", status, code);

describe("attachErrorMessage", () => {
  it("409 already_attached → kèm tên file trong ngoặc kép", () => {
    expect(attachErrorMessage(err(409, ALREADY_ATTACHED_CODE), "Kế hoạch")).toBe("“Kế hoạch” đã được gắn vào đây.");
  });

  it("409 không có tên / tên khoảng trắng → câu chung", () => {
    expect(attachErrorMessage(err(409, ALREADY_ATTACHED_CODE))).toBe("Tài liệu này đã được gắn vào đây.");
    expect(attachErrorMessage(err(409, ALREADY_ATTACHED_CODE), "  ")).toBe("Tài liệu này đã được gắn vào đây.");
  });

  it("404 invalid_target → không mở được bằng Taskeo, nhắc loại file và appId", () => {
    const message = attachErrorMessage(err(404, INVALID_TARGET_CODE));
    expect(message).toContain("Taskeo");
    expect(message).toContain("Docs, Sheets hoặc Slides");
    expect(message).toContain("app ID");
  });

  it("404 khác → không gian / dự án không còn", () => {
    expect(attachErrorMessage(err(404))).toContain("Không gian hoặc dự án");
  });

  it("403 → mời kết nối lại Drive", () => {
    expect(attachErrorMessage(err(403, DRIVE_NOT_CONNECTED_CODE))).toContain("kết nối lại Google Drive");
    expect(attachErrorMessage(err(403))).toContain("kết nối lại Google Drive");
  });

  it("503 picker_not_configured ≠ 503 khác", () => {
    const notConfigured = attachErrorMessage(err(503, PICKER_NOT_CONFIGURED_CODE));
    expect(notConfigured).toContain("Google Picker chưa được cấu hình trên máy chủ");
    const other = attachErrorMessage(err(503));
    expect(other).not.toBe(notConfigured);
    expect(other).toContain("Máy chủ");
  });

  it("502 → Google lỗi, nhắc xem Tài liệu gần đây", () => {
    expect(attachErrorMessage(err(502))).toContain("Tài liệu gần đây");
  });

  it("timeout → có thể đã gắn, nhắc xem Tài liệu gần đây", () => {
    const message = attachErrorMessage(err(0, CREATE_DOC_TIMEOUT_CODE));
    expect(message).toContain("quá lâu");
    expect(message).toContain("Tài liệu gần đây");
  });

  it("timeout khi lấy token (status 0, code timeout) → câu quá lâu, không phải câu chung", () => {
    const message = attachErrorMessage(new CreateDocRequestError("Máy chủ phản hồi quá lâu", 0, CREATE_DOC_TIMEOUT_CODE));
    expect(message).toContain("quá lâu");
    expect(message).not.toBe("Không gắn được tài liệu. Kiểm tra kết nối mạng rồi thử lại.");
  });

  it("script_load_failed → không tải được Google Picker, nhắc trình chặn quảng cáo", () => {
    const message = attachErrorMessage(new PickerLoadError());
    expect(message).toContain("Không tải được Google Picker");
    expect(message).toContain("trình chặn quảng cáo");
  });

  it("401 → đăng nhập lại", () => {
    expect(attachErrorMessage(err(401))).toContain("đăng nhập lại");
  });

  it.each([err(500), err(400), new Error("x"), "x", null])("còn lại → câu chung (%s)", (error) => {
    expect(attachErrorMessage(error)).toBe("Không gắn được tài liệu. Kiểm tra kết nối mạng rồi thử lại.");
  });

  it("không lộ message kỹ thuật", () => {
    for (const status of [400, 401, 403, 404, 409, 500, 502, 503]) {
      expect(attachErrorMessage(err(status))).not.toContain("technical detail");
    }
  });

  it("có câu cho file chọn sai loại", () => {
    expect(PICKER_INVALID_MESSAGE).toContain("Docs, Sheets hoặc Slides");
  });
});

describe("isAttachBusy", () => {
  it.each([
    ["idle", false],
    ["loading", true],
    ["picking", true],
    ["attaching", true],
  ] as const)("%s → %s", (phase, expected) => {
    expect(isAttachBusy(phase)).toBe(expected);
  });
});

describe("canDismissAttach", () => {
  it.each([
    ["idle", true],
    ["loading", true],
    ["picking", false],
    ["attaching", false],
  ] as const)("%s → %s", (phase, expected) => {
    expect(canDismissAttach(phase)).toBe(expected);
  });
});

describe("attachButtonLabel", () => {
  it.each([
    ["idle", "Chọn từ Google Drive"],
    ["loading", "Đang mở Google Drive…"],
    ["picking", "Đang chọn file trên Google Drive…"],
    ["attaching", "Đang gắn…"],
  ] as const)("%s → %s", (phase, expected) => {
    expect(attachButtonLabel(phase)).toBe(expected);
  });
});
