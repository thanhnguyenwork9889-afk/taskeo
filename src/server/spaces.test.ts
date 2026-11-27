import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SPACE_ICON, SPACE_PALETTE } from "@/domain/labels";
import type { SpaceRecord } from "@/domain/space-record";

const space = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
  count: vi.fn(),
  create: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock("@/server/db", () => ({ prisma: { space } }));

const provisionSpaceFolder = vi.hoisted(() => vi.fn());

vi.mock("@/server/google/drive-provision", () => ({ provisionSpaceFolder }));

import { createSpace, deleteSpace, getSpace, listSpaces, MAX_SPACES, updateSpace } from "./spaces";

const USER = "user-1";

function record(overrides: Partial<SpaceRecord> = {}): SpaceRecord {
  return {
    id: "s1",
    name: "Công việc",
    description: null,
    color: SPACE_PALETTE[1].color,
    icon: "briefcase",
    driveFolderId: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  // Mặc định Drive không tạo được thư mục (chưa kết nối / thiếu scope).
  provisionSpaceFolder.mockResolvedValue(null);
});

describe("listSpaces", () => {
  it("lọc theo userId, sắp theo order rồi createdAt và map qua spaceFromRecord", async () => {
    space.findMany.mockResolvedValue([record(), record({ id: "s2", color: null, icon: "lạ" })]);

    const result = await listSpaces(USER);

    const args = space.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ userId: USER });
    expect(args.orderBy).toEqual([{ order: "asc" }, { createdAt: "asc" }]);
    expect(args.take).toBe(MAX_SPACES);
    expect(args.select).toEqual({
      id: true,
      name: true,
      description: true,
      color: true,
      icon: true,
      driveFolderId: true,
    });
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: "s1", description: "", color: SPACE_PALETTE[1].color, icon: "briefcase" });
    expect(result[0].tint).toBe(SPACE_PALETTE[1].tint);
    expect(result[1]).toMatchObject({ id: "s2", color: SPACE_PALETTE[0].color, icon: DEFAULT_SPACE_ICON });
  });
});

describe("getSpace", () => {
  it("tìm theo id và userId", async () => {
    space.findFirst.mockResolvedValue(record());

    const result = await getSpace(USER, "s1");

    expect(space.findFirst.mock.calls[0][0].where).toEqual({ id: "s1", userId: USER });
    expect(result?.id).toBe("s1");
  });

  it("trả null khi không thấy (id của người khác)", async () => {
    space.findFirst.mockResolvedValue(null);

    expect(await getSpace(USER, "s-other")).toBeNull();
  });
});

describe("createSpace", () => {
  it("dùng màu theo số lượng, icon mặc định, order = count và userId từ tham số", async () => {
    space.count.mockResolvedValue(SPACE_PALETTE.length + 2);
    space.create.mockImplementation(async ({ data }) => ({ id: "new", driveFolderId: null, ...data }));

    const result = await createSpace(USER, { name: "Mới" });

    expect(space.count.mock.calls[0][0].where).toEqual({ userId: USER });
    const { data } = space.create.mock.calls[0][0];
    expect(data).toEqual({
      userId: USER,
      name: "Mới",
      description: null,
      color: SPACE_PALETTE[2].color,
      icon: DEFAULT_SPACE_ICON,
      order: SPACE_PALETTE.length + 2,
    });
    expect(result).toEqual({ ok: true, space: expect.objectContaining({ id: "new", name: "Mới", description: "" }) });
    expect(result.ok && result.space.color).toBe(SPACE_PALETTE[2].color);
  });

  it("vẫn tạo khi đang có MAX_SPACES - 1 không gian", async () => {
    space.count.mockResolvedValue(MAX_SPACES - 1);
    space.create.mockImplementation(async ({ data }) => ({ id: "new", driveFolderId: null, ...data }));

    const result = await createSpace(USER, { name: "Cuối" });

    expect(result.ok).toBe(true);
    expect(space.create.mock.calls[0][0].data.order).toBe(MAX_SPACES - 1);
  });

  it.each([MAX_SPACES, MAX_SPACES + 5])("không tạo và trả reason limit khi đã có %i không gian", async (count) => {
    space.count.mockResolvedValue(count);

    const result = await createSpace(USER, { name: "Thừa" });

    expect(result).toEqual({ ok: false, reason: "limit" });
    expect(space.create).not.toHaveBeenCalled();
  });

  it("lưu null khi mô tả rỗng (sau trim ở schema)", async () => {
    space.count.mockResolvedValue(0);
    space.create.mockImplementation(async ({ data }) => ({ id: "new", driveFolderId: null, ...data }));

    await createSpace(USER, { name: "A", description: "" });

    expect(space.create.mock.calls[0][0].data.description).toBeNull();
  });

  it("giữ màu, icon, mô tả người dùng chọn và bỏ khoá lạ trong input", async () => {
    space.count.mockResolvedValue(0);
    space.create.mockImplementation(async ({ data }) => ({ id: "new", driveFolderId: null, ...data }));
    const input = {
      name: "Nhà",
      description: "Việc nhà",
      color: SPACE_PALETTE[3].color,
      icon: "home",
      userId: "attacker",
      order: 99,
    } as unknown as Parameters<typeof createSpace>[1];

    await createSpace(USER, input);

    const { data } = space.create.mock.calls[0][0];
    expect(data).toEqual({
      userId: USER,
      name: "Nhà",
      description: "Việc nhà",
      color: SPACE_PALETTE[3].color,
      icon: "home",
      order: 0,
    });
  });
});

describe("createSpace · thư mục Drive", () => {
  beforeEach(() => {
    space.count.mockResolvedValue(0);
    space.create.mockImplementation(async ({ data }) => ({ id: "new", driveFolderId: null, ...data }));
  });

  it("gọi provisionSpaceFolder với id + name của bản ghi vừa tạo", async () => {
    space.create.mockResolvedValue(record({ id: "created", name: "Tên đã lưu" }));

    await createSpace(USER, { name: "Tên gửi lên" });

    expect(provisionSpaceFolder).toHaveBeenCalledTimes(1);
    expect(provisionSpaceFolder).toHaveBeenCalledWith(USER, { id: "created", name: "Tên đã lưu" });
  });

  it("có folderId → updateMany theo id + userId và trả driveFolderId", async () => {
    provisionSpaceFolder.mockResolvedValue("folder-1");
    space.updateMany.mockResolvedValue({ count: 1 });

    const result = await createSpace(USER, { name: "Mới" });

    expect(space.updateMany).toHaveBeenCalledTimes(1);
    expect(space.updateMany.mock.calls[0][0]).toEqual({
      where: { id: "new", userId: USER },
      data: { driveFolderId: "folder-1" },
    });
    expect(result.ok).toBe(true);
    expect(result.ok && result.space.driveFolderId).toBe("folder-1");
  });

  it("provision trả null → không ghi, driveFolderId null", async () => {
    const result = await createSpace(USER, { name: "Mới" });

    expect(space.updateMany).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.ok && result.space.driveFolderId).toBeNull();
  });

  it("updateMany ném → vẫn ok, driveFolderId null, log không chứa message", async () => {
    provisionSpaceFolder.mockResolvedValue("folder-1");
    space.updateMany.mockRejectedValue(new Error("SECRET connection string"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const result = await createSpace(USER, { name: "Mới" });

      expect(result.ok).toBe(true);
      expect(result.ok && result.space.driveFolderId).toBeNull();
      expect(log).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledWith("[spaces] Không lưu được driveFolderId", {
        userId: USER,
        spaceId: "new",
        error: "Error",
      });
      expect(JSON.stringify(log.mock.calls)).not.toContain("SECRET");
    } finally {
      log.mockRestore();
    }
  });

  it("updateMany count 0 (không gian vừa bị xoá) → driveFolderId null", async () => {
    provisionSpaceFolder.mockResolvedValue("folder-1");
    space.updateMany.mockResolvedValue({ count: 0 });

    const result = await createSpace(USER, { name: "Mới" });

    expect(result.ok).toBe(true);
    expect(result.ok && result.space.driveFolderId).toBeNull();
  });

  it("đạt giới hạn → không gọi provisionSpaceFolder", async () => {
    space.count.mockResolvedValue(MAX_SPACES);

    const result = await createSpace(USER, { name: "Thừa" });

    expect(result).toEqual({ ok: false, reason: "limit" });
    expect(provisionSpaceFolder).not.toHaveBeenCalled();
    expect(space.updateMany).not.toHaveBeenCalled();
  });
});

describe("updateSpace", () => {
  it("chỉ gửi trường có mặt, lọc theo id + userId rồi đọc lại", async () => {
    space.updateMany.mockResolvedValue({ count: 1 });
    space.findFirst.mockResolvedValue(record({ name: "Đổi tên" }));

    const result = await updateSpace(USER, "s1", { name: "Đổi tên", description: undefined });

    const args = space.updateMany.mock.calls[0][0];
    expect(args.where).toEqual({ id: "s1", userId: USER });
    expect(args.data).toEqual({ name: "Đổi tên" });
    expect(Object.keys(args.data)).toEqual(["name"]);
    expect(space.findFirst.mock.calls[0][0].where).toEqual({ id: "s1", userId: USER });
    expect(result?.name).toBe("Đổi tên");
  });

  it("bỏ khoá lạ ngoài name/description/color/icon", async () => {
    space.updateMany.mockResolvedValue({ count: 1 });
    space.findFirst.mockResolvedValue(record());
    const input = { icon: "heart", userId: "attacker", driveFolderId: "x" } as unknown as Parameters<
      typeof updateSpace
    >[2];

    await updateSpace(USER, "s1", input);

    expect(space.updateMany.mock.calls[0][0].data).toEqual({ icon: "heart" });
  });

  it("mô tả rỗng lưu null để xoá mô tả, mô tả có chữ giữ nguyên", async () => {
    space.updateMany.mockResolvedValue({ count: 1 });
    space.findFirst.mockResolvedValue(record());

    await updateSpace(USER, "s1", { description: "" });
    await updateSpace(USER, "s1", { description: "Mới" });

    expect(space.updateMany.mock.calls[0][0].data).toEqual({ description: null });
    expect(space.updateMany.mock.calls[1][0].data).toEqual({ description: "Mới" });
  });

  it("trả null và không đọc lại khi không cập nhật được bản ghi nào", async () => {
    space.updateMany.mockResolvedValue({ count: 0 });

    expect(await updateSpace(USER, "s-other", { name: "X" })).toBeNull();
    expect(space.findFirst).not.toHaveBeenCalled();
  });
});

describe("deleteSpace", () => {
  it("xoá theo id + userId, trả true khi có bản ghi bị xoá", async () => {
    space.deleteMany.mockResolvedValue({ count: 1 });

    expect(await deleteSpace(USER, "s1")).toBe(true);
    expect(space.deleteMany.mock.calls[0][0].where).toEqual({ id: "s1", userId: USER });
  });

  it("trả false khi id không thuộc người dùng", async () => {
    space.deleteMany.mockResolvedValue({ count: 0 });

    expect(await deleteSpace(USER, "s-other")).toBe(false);
  });
});
