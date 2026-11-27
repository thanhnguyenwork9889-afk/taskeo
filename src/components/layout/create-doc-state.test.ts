import { describe, expect, it } from "vitest";
import { DRIVE_NOT_CONNECTED_CODE } from "@/domain/drive-files";
import { CreateDocRequestError } from "./create-doc-api";
import { CREATE_DOC_TIMEOUT_CODE, CreateDocRequestError as RequestError } from "./create-doc-api";
import {
  createDocDialogState,
  createDocErrorMessage,
  initialProjectId,
  initialSpaceId,
  requestedProjectWait,
  type RequestedProjectWaitInput,
} from "./create-doc-state";

describe("createDocDialogState", () => {
  it.each([
    [false, "success", 3, "connect"],
    [false, "pending", 0, "connect"],
    [true, "pending", 0, "loading"],
    [true, "error", 0, "error"],
    [true, "success", 0, "no_spaces"],
    [true, "success", 2, "ready"],
  ] as const)("driveConnected=%s, %s, %i không gian → %s", (driveConnected, spacesStatus, spaceCount, expected) => {
    expect(createDocDialogState({ driveConnected, spacesStatus, spaceCount })).toBe(expected);
  });
});

const SPACES = [
  { id: "s1", name: "A" },
  { id: "s2", name: "B" },
];

describe("initialSpaceId", () => {
  it("giữ ID có trong danh sách", () => {
    expect(initialSpaceId("s2", SPACES)).toBe("s2");
  });

  it("ID store lạ / không truyền / khoảng trắng → không gian đầu tiên", () => {
    expect(initialSpaceId("store-id", SPACES)).toBe("s1");
    expect(initialSpaceId(undefined, SPACES)).toBe("s1");
    expect(initialSpaceId("  ", SPACES)).toBe("s1");
  });

  it("danh sách rỗng → chuỗi rỗng", () => {
    expect(initialSpaceId("s1", [])).toBe("");
  });
});

describe("initialProjectId", () => {
  const projects = [{ id: "p1", name: "P" }];

  it("có trong danh sách → giữ, không có / rỗng → chuỗi rỗng", () => {
    expect(initialProjectId("p1", projects)).toBe("p1");
    expect(initialProjectId("store-p", projects)).toBe("");
    expect(initialProjectId(undefined, projects)).toBe("");
    expect(initialProjectId("p1", [])).toBe("");
  });
});

describe("createDocErrorMessage", () => {
  it("403 drive_not_connected → mời kết nối Drive", () => {
    const message = createDocErrorMessage(new CreateDocRequestError("x", 403, DRIVE_NOT_CONNECTED_CODE));
    expect(message).toMatch(/kết nối Google Drive/i);
  });

  it("502 → nhắc xem Tài liệu gần đây trước khi thử lại", () => {
    const message = createDocErrorMessage(new CreateDocRequestError("x", 502));
    expect(message).toMatch(/thử lại/i);
    expect(message).toContain("Tài liệu gần đây");
  });

  it("hết thời gian chờ → có thể đã tạo, xem Tài liệu gần đây", () => {
    const message = createDocErrorMessage(new RequestError("x", 0, CREATE_DOC_TIMEOUT_CODE));
    expect(message).toBe("Tạo tài liệu quá lâu. Tài liệu có thể đã được tạo — hãy xem Tài liệu gần đây trước khi thử lại.");
  });

  it("status 0 không có code timeout → câu chung", () => {
    expect(createDocErrorMessage(new RequestError("x", 0))).toBe(createDocErrorMessage(null));
  });

  it("404 → không gian / dự án không còn", () => {
    expect(createDocErrorMessage(new CreateDocRequestError("x", 404))).toMatch(/không gian|dự án/i);
  });

  it("401 → hết phiên", () => {
    expect(createDocErrorMessage(new CreateDocRequestError("x", 401))).toMatch(/phiên/i);
  });

  it("403 không có code, 500, lỗi mạng → câu chung", () => {
    const generic = createDocErrorMessage(new TypeError("Failed to fetch"));
    expect(createDocErrorMessage(new CreateDocRequestError("x", 403))).toBe(generic);
    expect(createDocErrorMessage(new CreateDocRequestError("x", 500))).toBe(generic);
    expect(createDocErrorMessage(null)).toBe(generic);
    expect(generic).not.toContain("Failed to fetch");
  });
});

describe("requestedProjectWait", () => {
  const base: RequestedProjectWaitInput = {
    requestedProjectId: "p1",
    projectChoice: null,
    inStartSpace: true,
    projectsStatus: "pending",
  };

  it("mở từ dự án, chưa chọn, ở không gian ban đầu, đang tải → loading", () => {
    expect(requestedProjectWait(base)).toBe("loading");
  });

  it("tải dự án lỗi → error (vẫn chặn gửi)", () => {
    expect(requestedProjectWait({ ...base, projectsStatus: "error" })).toBe("error");
  });

  it("tải xong → không chờ", () => {
    expect(requestedProjectWait({ ...base, projectsStatus: "success" })).toBeNull();
  });

  it("người dùng đã tự chọn (kể cả không gắn dự án) → không chờ", () => {
    expect(requestedProjectWait({ ...base, projectChoice: "" })).toBeNull();
    expect(requestedProjectWait({ ...base, projectChoice: "p2", projectsStatus: "error" })).toBeNull();
  });

  it("đã đổi sang không gian khác → không chờ", () => {
    expect(requestedProjectWait({ ...base, inStartSpace: false })).toBeNull();
  });

  it("không yêu cầu dự án / rỗng / khoảng trắng → không chờ", () => {
    expect(requestedProjectWait({ ...base, requestedProjectId: undefined })).toBeNull();
    expect(requestedProjectWait({ ...base, requestedProjectId: "" })).toBeNull();
    expect(requestedProjectWait({ ...base, requestedProjectId: "   ", projectsStatus: "error" })).toBeNull();
  });

  it("không sửa input", () => {
    const input = Object.freeze({ ...base });
    requestedProjectWait(input);
    expect(input).toEqual(base);
  });
});
