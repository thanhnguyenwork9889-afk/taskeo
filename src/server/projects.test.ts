import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectRecord } from "@/domain/project-record";

const db = vi.hoisted(() => ({
  space: { findFirst: vi.fn() },
  project: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

vi.mock("@/server/db", () => ({ prisma: db }));

import {
  createProject,
  deleteProject,
  escapeLikePattern,
  getProject,
  listProjects,
  MAX_PROJECTS_PER_SPACE,
  updateProject,
} from "./projects";

const USER = "user-1";
const SPACE = "s1";
const { space, project } = db;

function record(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: "p1",
    spaceId: SPACE,
    name: "Dự án",
    description: null,
    status: "ACTIVE",
    dueDate: null,
    ...overrides,
  };
}

function uniqueViolation(): Error {
  return Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
}

/** Mọi lời gọi Prisma (trừ create, có userId trong data) phải lọc theo userId. */
function expectAllWhereHaveUserId(): void {
  const mocks = [space.findFirst, project.findMany, project.findFirst, project.count, project.aggregate, project.updateMany, project.deleteMany];
  for (const mock of mocks) {
    for (const [args] of mock.mock.calls) {
      expect(args.where.userId).toBe(USER);
    }
  }
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("escapeLikePattern", () => {
  it.each([
    ["Q1_plan", "Q1\\_plan"],
    ["100%", "100\\%"],
    ["a\\b", "a\\\\b"],
    ["\\%_", "\\\\\\%\\_"],
    ["Dự án thường", "Dự án thường"],
    ["", ""],
  ])("%j → %j", (input, expected) => {
    expect(escapeLikePattern(input)).toBe(expected);
  });

  it("thoát \\ trước để không nhân đôi \\ vừa thêm cho % và _", () => {
    expect(escapeLikePattern("\\_")).toBe("\\\\\\_");
  });
});

describe("listProjects", () => {
  it("kiểm không gian thuộc người dùng rồi lấy dự án theo userId + spaceId, có take", async () => {
    space.findFirst.mockResolvedValue({ id: SPACE });
    project.findMany.mockResolvedValue([record(), record({ id: "p2", status: "lạ", description: "Mô tả" })]);

    const result = await listProjects(USER, SPACE);

    expect(space.findFirst.mock.calls[0][0].where).toEqual({ id: SPACE, userId: USER });
    const args = project.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ userId: USER, spaceId: SPACE });
    expect(args.orderBy).toEqual([{ order: "asc" }, { createdAt: "asc" }]);
    expect(args.take).toBe(MAX_PROJECTS_PER_SPACE);
    expect(args.select).toEqual({
      id: true,
      spaceId: true,
      name: true,
      description: true,
      status: true,
      dueDate: true,
    });
    expect(result).toEqual([
      { id: "p1", spaceId: SPACE, name: "Dự án", description: "", status: "ACTIVE", dueDate: null },
      { id: "p2", spaceId: SPACE, name: "Dự án", description: "Mô tả", status: "ACTIVE", dueDate: null },
    ]);
    expectAllWhereHaveUserId();
  });

  it("trả null và không đọc dự án khi không gian không thuộc người dùng", async () => {
    space.findFirst.mockResolvedValue(null);

    expect(await listProjects(USER, "s-other")).toBeNull();
    expect(project.findMany).not.toHaveBeenCalled();
  });
});

describe("getProject", () => {
  it("tìm theo id + userId, đổi dueDate về YYYY-MM-DD", async () => {
    project.findFirst.mockResolvedValue(record({ dueDate: new Date("2026-12-01T00:00:00.000Z") }));

    const result = await getProject(USER, "p1");

    expect(project.findFirst.mock.calls[0][0].where).toEqual({ id: "p1", userId: USER });
    expect(result?.dueDate).toBe("2026-12-01");
  });

  it("trả null khi dự án của người khác", async () => {
    project.findFirst.mockResolvedValue(null);

    expect(await getProject(USER, "p-other")).toBeNull();
  });
});

describe("createProject", () => {
  function arrangeCreate(count = 3, maxOrder: number | null = null): void {
    space.findFirst.mockResolvedValue({ id: SPACE });
    project.count.mockResolvedValue(count);
    project.aggregate.mockResolvedValue({ _max: { order: maxOrder } });
    project.findFirst.mockResolvedValue(null);
    project.create.mockImplementation(async ({ data }) => ({
      id: "new",
      spaceId: data.spaceId,
      name: data.name,
      description: data.description,
      status: data.status ?? "ACTIVE",
      dueDate: data.dueDate ?? null,
    }));
  }

  it("tạo với userId, spaceId từ tham số, order = max(order) + 1, mô tả rỗng → null", async () => {
    arrangeCreate(3, 7);

    const result = await createProject(USER, SPACE, { name: "Mới", description: "" });

    expect(project.count.mock.calls[0][0].where).toEqual({ userId: USER, spaceId: SPACE });
    expect(project.aggregate.mock.calls[0][0]).toEqual({
      where: { userId: USER, spaceId: SPACE },
      _max: { order: true },
    });
    expect(project.findFirst.mock.calls[0][0].where).toEqual({
      userId: USER,
      spaceId: SPACE,
      name: { equals: "Mới", mode: "insensitive" },
    });
    const { data } = project.create.mock.calls[0][0];
    expect(data).toEqual({ userId: USER, spaceId: SPACE, name: "Mới", description: null, order: 8 });
    expect(Object.values(data)).not.toContain(undefined);
    expect(result).toEqual({
      ok: true,
      project: { id: "new", spaceId: SPACE, name: "Mới", description: "", status: "ACTIVE", dueDate: null },
    });
    expectAllWhereHaveUserId();
  });

  it("ghi status và dueDate (Date UTC), bỏ khoá lạ trong input", async () => {
    arrangeCreate(0);
    const input = {
      name: "A",
      description: "Mô tả",
      status: "ON_HOLD",
      dueDate: "2026-12-31",
      userId: "attacker",
      spaceId: "s-attacker",
      order: 99,
    } as unknown as Parameters<typeof createProject>[2];

    const result = await createProject(USER, SPACE, input);

    const { data } = project.create.mock.calls[0][0];
    expect(data).toEqual({
      userId: USER,
      spaceId: SPACE,
      name: "A",
      description: "Mô tả",
      status: "ON_HOLD",
      dueDate: new Date("2026-12-31T00:00:00.000Z"),
      order: 0,
    });
    expect(result.ok && result.project.dueDate).toBe("2026-12-31");
  });

  it("order = 0 khi chưa có dự án (max null)", async () => {
    arrangeCreate(0, null);

    await createProject(USER, SPACE, { name: "A" });

    expect(project.create.mock.calls[0][0].data.order).toBe(0);
  });

  it("tên có _ và % gửi equals đã thoát (ILIKE không coi là ký tự đại diện)", async () => {
    arrangeCreate(1);

    await createProject(USER, SPACE, { name: "Q1_plan%" });

    expect(project.findFirst.mock.calls[0][0].where.name).toEqual({ equals: "Q1\\_plan\\%", mode: "insensitive" });
    expect(project.create.mock.calls[0][0].data.name).toBe("Q1_plan%");
  });

  it("dueDate null lưu null", async () => {
    arrangeCreate(0);

    await createProject(USER, SPACE, { name: "A", dueDate: null });

    expect(project.create.mock.calls[0][0].data.dueDate).toBeNull();
  });

  it("không gian của người khác → not_found, không đếm, không tạo", async () => {
    space.findFirst.mockResolvedValue(null);

    expect(await createProject(USER, "s-other", { name: "A" })).toEqual({ ok: false, reason: "not_found" });
    expect(space.findFirst.mock.calls[0][0].where).toEqual({ id: "s-other", userId: USER });
    expect(project.count).not.toHaveBeenCalled();
    expect(project.create).not.toHaveBeenCalled();
  });

  it.each([MAX_PROJECTS_PER_SPACE, MAX_PROJECTS_PER_SPACE + 1])("đã có %i dự án → limit", async (count) => {
    arrangeCreate(count);

    expect(await createProject(USER, SPACE, { name: "A" })).toEqual({ ok: false, reason: "limit" });
    expect(project.create).not.toHaveBeenCalled();
  });

  it("vẫn tạo khi có MAX_PROJECTS_PER_SPACE - 1 dự án", async () => {
    arrangeCreate(MAX_PROJECTS_PER_SPACE - 1);

    expect((await createProject(USER, SPACE, { name: "A" })).ok).toBe(true);
  });

  it("tên trùng (kiểm trước, không phân biệt hoa thường) → conflict, không tạo", async () => {
    arrangeCreate(1);
    project.findFirst.mockResolvedValue({ id: "p-dup" });

    expect(await createProject(USER, SPACE, { name: "dự ÁN" })).toEqual({ ok: false, reason: "conflict" });
    expect(project.create).not.toHaveBeenCalled();
  });

  it("create ném P2002 (đồng thời) → conflict", async () => {
    arrangeCreate(1);
    project.create.mockRejectedValue(uniqueViolation());

    expect(await createProject(USER, SPACE, { name: "A" })).toEqual({ ok: false, reason: "conflict" });
  });

  it("lỗi Prisma khác ném tiếp", async () => {
    arrangeCreate(1);
    const error = Object.assign(new Error("FK"), { code: "P2003" });
    project.create.mockRejectedValue(error);

    await expect(createProject(USER, SPACE, { name: "A" })).rejects.toBe(error);
  });
});

describe("updateProject", () => {
  function arrangeUpdate(updated: Partial<ProjectRecord> = {}): void {
    project.findFirst
      .mockResolvedValueOnce({ spaceId: SPACE }) // đọc dự án
      .mockResolvedValueOnce(null) // kiểm trùng tên (nếu có)
      .mockResolvedValue(record(updated)); // đọc lại
    project.updateMany.mockResolvedValue({ count: 1 });
  }

  it("đổi tên: kiểm trùng trong cùng không gian, bỏ chính nó, chỉ gửi name", async () => {
    arrangeUpdate({ name: "Tên mới" });

    const result = await updateProject(USER, "p1", { name: "Tên mới" });

    const calls = project.findFirst.mock.calls;
    expect(calls[0][0].where).toEqual({ id: "p1", userId: USER });
    expect(calls[1][0].where).toEqual({
      userId: USER,
      spaceId: SPACE,
      name: { equals: "Tên mới", mode: "insensitive" },
      NOT: { id: "p1" },
    });
    const args = project.updateMany.mock.calls[0][0];
    expect(args.where).toEqual({ id: "p1", userId: USER });
    expect(args.data).toEqual({ name: "Tên mới" });
    expect(calls[2][0].where).toEqual({ id: "p1", userId: USER });
    expect(result).toEqual({ ok: true, project: expect.objectContaining({ id: "p1", name: "Tên mới" }) });
    expectAllWhereHaveUserId();
  });

  it("không có name thì không kiểm trùng; data chỉ có trường gửi lên, không có key undefined", async () => {
    project.findFirst.mockResolvedValueOnce({ spaceId: SPACE }).mockResolvedValue(record({ status: "DONE" }));
    project.updateMany.mockResolvedValue({ count: 1 });

    await updateProject(USER, "p1", { status: "DONE", description: undefined });

    expect(project.findFirst).toHaveBeenCalledTimes(2);
    const { data } = project.updateMany.mock.calls[0][0];
    expect(data).toEqual({ status: "DONE" });
    expect(Object.keys(data)).toEqual(["status"]);
  });

  it("mô tả rỗng → null, dueDate → Date UTC, dueDate null giữ null, bỏ khoá lạ", async () => {
    project.findFirst.mockResolvedValueOnce({ spaceId: SPACE }).mockResolvedValue(record());
    project.updateMany.mockResolvedValue({ count: 1 });
    const input = { description: "", dueDate: "2026-03-01", spaceId: "s-x", userId: "x" } as unknown as Parameters<
      typeof updateProject
    >[2];

    await updateProject(USER, "p1", input);
    project.findFirst.mockResolvedValueOnce({ spaceId: SPACE }).mockResolvedValue(record());
    await updateProject(USER, "p1", { dueDate: null, description: "Có chữ" });

    expect(project.updateMany.mock.calls[0][0].data).toEqual({
      description: null,
      dueDate: new Date("2026-03-01T00:00:00.000Z"),
    });
    expect(project.updateMany.mock.calls[1][0].data).toEqual({ dueDate: null, description: "Có chữ" });
  });

  it("dự án của người khác → not_found, không cập nhật", async () => {
    project.findFirst.mockResolvedValue(null);

    expect(await updateProject(USER, "p-other", { name: "X" })).toEqual({ ok: false, reason: "not_found" });
    expect(project.updateMany).not.toHaveBeenCalled();
  });

  it("đổi tên có _ và % gửi equals đã thoát, data giữ tên gốc", async () => {
    arrangeUpdate({ name: "Q1_plan%" });

    await updateProject(USER, "p1", { name: "Q1_plan%" });

    expect(project.findFirst.mock.calls[1][0].where.name).toEqual({ equals: "Q1\\_plan\\%", mode: "insensitive" });
    expect(project.updateMany.mock.calls[0][0].data).toEqual({ name: "Q1_plan%" });
  });

  it("updateMany count 0 (bị xoá giữa chừng) → not_found", async () => {
    project.findFirst.mockResolvedValueOnce({ spaceId: SPACE });
    project.updateMany.mockResolvedValue({ count: 0 });

    expect(await updateProject(USER, "p1", { status: "DONE" })).toEqual({ ok: false, reason: "not_found" });
  });

  it("tên trùng với dự án khác (kiểm trước) → conflict, không cập nhật", async () => {
    project.findFirst.mockResolvedValueOnce({ spaceId: SPACE }).mockResolvedValueOnce({ id: "p2" });

    expect(await updateProject(USER, "p1", { name: "Trùng" })).toEqual({ ok: false, reason: "conflict" });
    expect(project.updateMany).not.toHaveBeenCalled();
  });

  it("updateMany ném P2002 → conflict", async () => {
    arrangeUpdate();
    project.updateMany.mockRejectedValue(uniqueViolation());

    expect(await updateProject(USER, "p1", { name: "A" })).toEqual({ ok: false, reason: "conflict" });
  });

  it("lỗi Prisma khác ném tiếp", async () => {
    arrangeUpdate();
    const error = new Error("mất kết nối");
    project.updateMany.mockRejectedValue(error);

    await expect(updateProject(USER, "p1", { name: "A" })).rejects.toBe(error);
  });
});

describe("deleteProject", () => {
  it("xoá theo id + userId, true khi có bản ghi bị xoá", async () => {
    project.deleteMany.mockResolvedValue({ count: 1 });

    expect(await deleteProject(USER, "p1")).toBe(true);
    expect(project.deleteMany.mock.calls[0][0].where).toEqual({ id: "p1", userId: USER });
  });

  it("false khi id không thuộc người dùng", async () => {
    project.deleteMany.mockResolvedValue({ count: 0 });

    expect(await deleteProject(USER, "p-other")).toBe(false);
  });
});
