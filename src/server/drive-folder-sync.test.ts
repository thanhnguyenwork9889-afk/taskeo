import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, provisionSpaceFolder, provisionProjectFolder } = vi.hoisted(() => ({
  db: {
    space: { findFirst: vi.fn(), updateMany: vi.fn() },
    project: { findFirst: vi.fn(), updateMany: vi.fn() },
  },
  provisionSpaceFolder: vi.fn(),
  provisionProjectFolder: vi.fn(),
}));

vi.mock("@/server/db", () => ({ prisma: db }));
vi.mock("@/server/google/drive-provision", () => ({ provisionSpaceFolder, provisionProjectFolder }));

import { ensureProjectFolderId, ensureSpaceFolderId } from "./drive-folder-sync";

const USER = "user-1";
const LOG = { prefix: "[files]" };
const SPACE = { id: "s1", name: "Không gian", driveFolderId: null as string | null };
const PROJECT = { id: "p1", name: "Dự án", driveFolderId: null as string | null };
const { space, project } = db;

/** Mọi lời gọi Prisma phải lọc theo userId. */
function expectAllWhereHaveUserId(): void {
  for (const mock of [space.findFirst, space.updateMany, project.findFirst, project.updateMany]) {
    for (const [args] of mock.mock.calls) expect(args.where.userId).toBe(USER);
  }
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("ensureSpaceFolderId", () => {
  it("đã có driveFolderId → trả luôn, không provision, không đụng DB", async () => {
    expect(await ensureSpaceFolderId(USER, { ...SPACE, driveFolderId: "f-space" }, LOG)).toBe("f-space");
    expect(provisionSpaceFolder).not.toHaveBeenCalled();
    expect(space.updateMany).not.toHaveBeenCalled();
    expect(space.findFirst).not.toHaveBeenCalled();
  });

  it("null → provision, ghi có điều kiện driveFolderId: null, đọc lại", async () => {
    provisionSpaceFolder.mockResolvedValue("f-space");
    space.updateMany.mockResolvedValue({ count: 1 });
    space.findFirst.mockResolvedValue({ driveFolderId: "f-space" });

    expect(await ensureSpaceFolderId(USER, SPACE, LOG)).toBe("f-space");

    expect(provisionSpaceFolder).toHaveBeenCalledWith(USER, { id: "s1", name: "Không gian" });
    expect(space.updateMany).toHaveBeenCalledWith({
      where: { id: "s1", userId: USER, driveFolderId: null },
      data: { driveFolderId: "f-space" },
    });
    expect(space.findFirst).toHaveBeenCalledWith({
      where: { id: "s1", userId: USER },
      select: { driveFolderId: true },
    });
    expect(space.updateMany.mock.invocationCallOrder[0]).toBeLessThan(space.findFirst.mock.invocationCallOrder[0]);
    expectAllWhereHaveUserId();
  });

  it("thua đua (count 0) → dùng id đọc lại", async () => {
    provisionSpaceFolder.mockResolvedValue("f-mine");
    space.updateMany.mockResolvedValue({ count: 0 });
    space.findFirst.mockResolvedValue({ driveFolderId: "winner" });

    expect(await ensureSpaceFolderId(USER, SPACE, LOG)).toBe("winner");
  });

  it("provision trả null → null, không ghi, không đọc lại", async () => {
    provisionSpaceFolder.mockResolvedValue(null);

    expect(await ensureSpaceFolderId(USER, SPACE, LOG)).toBeNull();
    expect(space.updateMany).not.toHaveBeenCalled();
    expect(space.findFirst).not.toHaveBeenCalled();
  });

  it("ghi lỗi → log an toàn (tiền tố + context), không ném, vẫn đọc lại", async () => {
    provisionSpaceFolder.mockResolvedValue("f-mine");
    space.updateMany.mockRejectedValue(new Error("SECRET"));
    space.findFirst.mockResolvedValue({ driveFolderId: "winner" });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const result = await ensureSpaceFolderId(USER, SPACE, { prefix: "[projects]", context: { projectId: "new" } });
      expect(result).toBe("winner");
      expect(log.mock.calls).toEqual([
        ["[projects] Không lưu được driveFolderId", { userId: USER, spaceId: "s1", projectId: "new", error: "Error" }],
      ]);
      expect(JSON.stringify(log.mock.calls)).not.toContain("SECRET");
    } finally {
      log.mockRestore();
    }
  });

  it("đọc lại lỗi → null, log không lộ message", async () => {
    provisionSpaceFolder.mockResolvedValue("f-space");
    space.updateMany.mockResolvedValue({ count: 1 });
    space.findFirst.mockRejectedValue("SECRET");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      expect(await ensureSpaceFolderId(USER, SPACE, LOG)).toBeNull();
      expect(log.mock.calls).toEqual([
        ["[files] Không đọc lại được driveFolderId của không gian", { userId: USER, spaceId: "s1", error: "unknown" }],
      ]);
    } finally {
      log.mockRestore();
    }
  });

  it("đọc lại null (không gian bị xoá) hoặc vẫn null → null", async () => {
    provisionSpaceFolder.mockResolvedValue("f-space");
    space.updateMany.mockResolvedValue({ count: 0 });
    space.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ driveFolderId: null });

    expect(await ensureSpaceFolderId(USER, SPACE, LOG)).toBeNull();
    expect(await ensureSpaceFolderId(USER, SPACE, LOG)).toBeNull();
  });
});

describe("ensureProjectFolderId", () => {
  const SPACE_WITH_FOLDER = { ...SPACE, driveFolderId: "f-space" };

  it("dự án đã có driveFolderId → trả luôn, không provision gì", async () => {
    const result = await ensureProjectFolderId(
      USER,
      { space: SPACE, project: { ...PROJECT, driveFolderId: "f-project" } },
      LOG,
    );
    expect(result).toBe("f-project");
    expect(provisionSpaceFolder).not.toHaveBeenCalled();
    expect(provisionProjectFolder).not.toHaveBeenCalled();
    expect(project.updateMany).not.toHaveBeenCalled();
  });

  it("không gian có thư mục → provision dự án trong đó, ghi có điều kiện, đọc lại", async () => {
    provisionProjectFolder.mockResolvedValue("f-project");
    project.updateMany.mockResolvedValue({ count: 1 });
    project.findFirst.mockResolvedValue({ driveFolderId: "f-project" });

    expect(await ensureProjectFolderId(USER, { space: SPACE_WITH_FOLDER, project: PROJECT }, LOG)).toBe("f-project");

    expect(provisionSpaceFolder).not.toHaveBeenCalled();
    expect(provisionProjectFolder).toHaveBeenCalledWith(USER, {
      spaceId: "s1",
      parentFolderId: "f-space",
      project: { id: "p1", name: "Dự án" },
    });
    expect(project.updateMany).toHaveBeenCalledWith({
      where: { id: "p1", userId: USER, driveFolderId: null },
      data: { driveFolderId: "f-project" },
    });
    expect(project.findFirst).toHaveBeenCalledWith({
      where: { id: "p1", userId: USER },
      select: { driveFolderId: true },
    });
    expectAllWhereHaveUserId();
  });

  it("không gian chưa có thư mục → tạo thư mục không gian trước rồi dự án (trong id đọc lại)", async () => {
    provisionSpaceFolder.mockResolvedValue("f-mine");
    space.updateMany.mockResolvedValue({ count: 0 });
    space.findFirst.mockResolvedValue({ driveFolderId: "winner" });
    provisionProjectFolder.mockResolvedValue("f-project");
    project.updateMany.mockResolvedValue({ count: 1 });
    project.findFirst.mockResolvedValue({ driveFolderId: "f-project" });

    expect(await ensureProjectFolderId(USER, { space: SPACE, project: PROJECT }, LOG)).toBe("f-project");

    expect(space.findFirst.mock.invocationCallOrder[0]).toBeLessThan(
      provisionProjectFolder.mock.invocationCallOrder[0],
    );
    expect(provisionProjectFolder.mock.calls[0][1].parentFolderId).toBe("winner");
    expectAllWhereHaveUserId();
  });

  it("không lấy được thư mục không gian → null, không provision dự án", async () => {
    provisionSpaceFolder.mockResolvedValue(null);

    expect(await ensureProjectFolderId(USER, { space: SPACE, project: PROJECT }, LOG)).toBeNull();
    expect(provisionProjectFolder).not.toHaveBeenCalled();
    expect(project.updateMany).not.toHaveBeenCalled();
  });

  it("provision dự án null → null, không ghi", async () => {
    provisionProjectFolder.mockResolvedValue(null);

    expect(await ensureProjectFolderId(USER, { space: SPACE_WITH_FOLDER, project: PROJECT }, LOG)).toBeNull();
    expect(project.updateMany).not.toHaveBeenCalled();
    expect(project.findFirst).not.toHaveBeenCalled();
  });

  it("thua đua (count 0) → dùng id dự án đọc lại", async () => {
    provisionProjectFolder.mockResolvedValue("f-mine");
    project.updateMany.mockResolvedValue({ count: 0 });
    project.findFirst.mockResolvedValue({ driveFolderId: "winner" });

    expect(await ensureProjectFolderId(USER, { space: SPACE_WITH_FOLDER, project: PROJECT }, LOG)).toBe("winner");
  });

  it("ghi lỗi → log an toàn có projectId, không ném, vẫn đọc lại", async () => {
    provisionProjectFolder.mockResolvedValue("f-project");
    project.updateMany.mockRejectedValue(Object.assign(new Error("SECRET"), { name: "PrismaClientKnownRequestError" }));
    project.findFirst.mockResolvedValue({ driveFolderId: null });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      expect(await ensureProjectFolderId(USER, { space: SPACE_WITH_FOLDER, project: PROJECT }, LOG)).toBeNull();
      expect(log.mock.calls).toEqual([
        [
          "[files] Không lưu được driveFolderId",
          { userId: USER, spaceId: "s1", projectId: "p1", error: "PrismaClientKnownRequestError" },
        ],
      ]);
      expect(JSON.stringify(log.mock.calls)).not.toContain("SECRET");
    } finally {
      log.mockRestore();
    }
  });

  it("đọc lại dự án lỗi → null, log an toàn", async () => {
    provisionProjectFolder.mockResolvedValue("f-project");
    project.updateMany.mockResolvedValue({ count: 1 });
    project.findFirst.mockRejectedValue(new Error("SECRET"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      expect(await ensureProjectFolderId(USER, { space: SPACE_WITH_FOLDER, project: PROJECT }, LOG)).toBeNull();
      expect(log.mock.calls).toEqual([
        [
          "[files] Không đọc lại được driveFolderId của dự án",
          { userId: USER, spaceId: "s1", projectId: "p1", error: "Error" },
        ],
      ]);
      expect(JSON.stringify(log.mock.calls)).not.toContain("SECRET");
    } finally {
      log.mockRestore();
    }
  });
});
