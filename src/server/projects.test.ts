import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectRecord } from "@/domain/project-record";

// Lệnh ghi của createProject chỉ được gọi qua `tx` trong `$transaction`; `db.project` không có
// `create`, nên gọi nhầm `prisma.project.create` (ngoài transaction) thì test hỏng.
const { db, tx, provisionSpaceFolder, provisionProjectFolder } = vi.hoisted(() => ({
  db: {
    space: { findFirst: vi.fn(), updateMany: vi.fn() },
    project: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  tx: {
    project: { create: vi.fn() },
    activity: { createMany: vi.fn() },
  },
  provisionSpaceFolder: vi.fn(),
  provisionProjectFolder: vi.fn(),
}));

vi.mock("@/server/db", () => ({ prisma: db }));
vi.mock("@/server/google/drive-provision", () => ({ provisionSpaceFolder, provisionProjectFolder }));

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
const NOW = new Date("2026-11-26T08:00:00.000Z");
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

/** Mọi lời gọi Prisma phải lọc theo userId; lệnh tạo phải ghi userId vào từng `data`. */
function expectAllWhereHaveUserId(): void {
  const mocks = [space.findFirst, space.updateMany, project.findMany, project.findFirst, project.count, project.aggregate, project.updateMany, project.deleteMany];
  for (const mock of mocks) {
    for (const [args] of mock.mock.calls) {
      expect(args.where.userId).toBe(USER);
    }
  }
  for (const [args] of tx.project.create.mock.calls) {
    expect(args.data.userId).toBe(USER);
  }
  for (const [args] of tx.activity.createMany.mock.calls) {
    for (const row of args.data) {
      expect(row.userId).toBe(USER);
    }
  }
}

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx));
  tx.activity.createMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({ count: data.length }));
  provisionSpaceFolder.mockResolvedValue(null);
  provisionProjectFolder.mockResolvedValue(null);
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
  const SPACE_ROW = { id: SPACE, name: "Không gian", driveFolderId: null as string | null };

  function arrangeCreate(count = 3, maxOrder: number | null = null): void {
    space.findFirst.mockResolvedValue(SPACE_ROW);
    project.count.mockResolvedValue(count);
    project.aggregate.mockResolvedValue({ _max: { order: maxOrder } });
    project.findFirst.mockResolvedValue(null);
    tx.project.create.mockImplementation(async ({ data }) => ({
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
    const { data } = tx.project.create.mock.calls[0][0];
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

    const { data } = tx.project.create.mock.calls[0][0];
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

    expect(tx.project.create.mock.calls[0][0].data.order).toBe(0);
  });

  it("tên có _ và % gửi equals đã thoát (ILIKE không coi là ký tự đại diện)", async () => {
    arrangeCreate(1);

    await createProject(USER, SPACE, { name: "Q1_plan%" });

    expect(project.findFirst.mock.calls[0][0].where.name).toEqual({ equals: "Q1\\_plan\\%", mode: "insensitive" });
    expect(tx.project.create.mock.calls[0][0].data.name).toBe("Q1_plan%");
  });

  it("dueDate null lưu null", async () => {
    arrangeCreate(0);

    await createProject(USER, SPACE, { name: "A", dueDate: null });

    expect(tx.project.create.mock.calls[0][0].data.dueDate).toBeNull();
  });

  it("không gian của người khác → not_found, không đếm, không tạo", async () => {
    space.findFirst.mockResolvedValue(null);

    expect(await createProject(USER, "s-other", { name: "A" })).toEqual({ ok: false, reason: "not_found" });
    expect(space.findFirst.mock.calls[0][0].where).toEqual({ id: "s-other", userId: USER });
    expect(project.count).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(provisionSpaceFolder).not.toHaveBeenCalled();
    expect(provisionProjectFolder).not.toHaveBeenCalled();
  });

  it.each([MAX_PROJECTS_PER_SPACE, MAX_PROJECTS_PER_SPACE + 1])("đã có %i dự án → limit", async (count) => {
    arrangeCreate(count);

    expect(await createProject(USER, SPACE, { name: "A" })).toEqual({ ok: false, reason: "limit" });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(provisionSpaceFolder).not.toHaveBeenCalled();
    expect(provisionProjectFolder).not.toHaveBeenCalled();
  });

  it("vẫn tạo khi có MAX_PROJECTS_PER_SPACE - 1 dự án", async () => {
    arrangeCreate(MAX_PROJECTS_PER_SPACE - 1);

    expect((await createProject(USER, SPACE, { name: "A" })).ok).toBe(true);
  });

  it("tên trùng (kiểm trước, không phân biệt hoa thường) → conflict, không tạo", async () => {
    arrangeCreate(1);
    project.findFirst.mockResolvedValue({ id: "p-dup" });

    expect(await createProject(USER, SPACE, { name: "dự ÁN" })).toEqual({ ok: false, reason: "conflict" });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(provisionSpaceFolder).not.toHaveBeenCalled();
    expect(provisionProjectFolder).not.toHaveBeenCalled();
  });

  it("create ném P2002 (đồng thời) → conflict, không ghi activity", async () => {
    arrangeCreate(1);
    tx.project.create.mockRejectedValue(uniqueViolation());

    expect(await createProject(USER, SPACE, { name: "A" })).toEqual({ ok: false, reason: "conflict" });
    expect(tx.activity.createMany).not.toHaveBeenCalled();
    expect(provisionSpaceFolder).not.toHaveBeenCalled();
    expect(provisionProjectFolder).not.toHaveBeenCalled();
  });

  it("ghi dự án và activity project_created qua cùng một transaction", async () => {
    arrangeCreate(2);

    const result = await createProject(USER, SPACE, { name: "Mới" }, NOW);

    expect(result.ok).toBe(true);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.project.create).toHaveBeenCalledTimes(1);
    expect(tx.activity.createMany).toHaveBeenCalledTimes(1);
    expect(tx.activity.createMany.mock.calls[0][0]).toEqual({
      data: [
        {
          userId: USER,
          type: "project_created",
          entityId: "new",
          meta: { message: "Tạo dự án" },
          createdAt: NOW,
        },
      ],
    });
    expect(tx.project.create.mock.invocationCallOrder[0]).toBeLessThan(
      tx.activity.createMany.mock.invocationCallOrder[0],
    );
    expectAllWhereHaveUserId();
  });

  it("không truyền now → createdAt của activity là Date lúc gọi", async () => {
    arrangeCreate(0);

    await createProject(USER, SPACE, { name: "A" });

    expect(tx.activity.createMany.mock.calls[0][0].data[0].createdAt).toBeInstanceOf(Date);
  });

  it("activity.createMany lỗi → createProject ném lại đúng lỗi đó", async () => {
    arrangeCreate(1);
    const error = new Error("ghi activity thất bại");
    tx.activity.createMany.mockRejectedValue(error);

    await expect(createProject(USER, SPACE, { name: "A" })).rejects.toBe(error);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(provisionSpaceFolder).not.toHaveBeenCalled();
    expect(provisionProjectFolder).not.toHaveBeenCalled();
  });

  it("mọi P2002 phát ra trong transaction (kể cả từ activity.createMany) đều thành conflict", async () => {
    arrangeCreate(1);
    tx.activity.createMany.mockRejectedValue(uniqueViolation());

    expect(await createProject(USER, SPACE, { name: "A" })).toEqual({ ok: false, reason: "conflict" });
    expect(provisionSpaceFolder).not.toHaveBeenCalled();
    expect(provisionProjectFolder).not.toHaveBeenCalled();
  });

  it("lỗi Prisma khác ném tiếp", async () => {
    arrangeCreate(1);
    const error = Object.assign(new Error("FK"), { code: "P2003" });
    tx.project.create.mockRejectedValue(error);

    await expect(createProject(USER, SPACE, { name: "A" })).rejects.toBe(error);
    expect(provisionSpaceFolder).not.toHaveBeenCalled();
    expect(provisionProjectFolder).not.toHaveBeenCalled();
  });

  describe("thư mục Drive (best-effort)", () => {
    const CREATED = { id: "new", spaceId: SPACE, name: "Mới", description: "", status: "ACTIVE", dueDate: null };
    const SPACE_WITH_FOLDER = { id: SPACE, name: "Không gian", driveFolderId: "f-space" };

    /** Không gian chưa có thư mục: lần đọc đầu (findOwnedSpace) trả SPACE_ROW, lần đọc lại trả `reread`. */
    function arrangeFolderless(reread: unknown): void {
      arrangeCreate(0);
      space.findFirst.mockReset();
      space.findFirst.mockResolvedValueOnce(SPACE_ROW);
      if (reread instanceof Error) space.findFirst.mockRejectedValueOnce(reread);
      else space.findFirst.mockResolvedValueOnce(reread);
    }

    it("đọc không gian kèm id, name, driveFolderId theo id + userId", async () => {
      arrangeCreate(0);

      await createProject(USER, SPACE, { name: "Mới" });

      expect(space.findFirst.mock.calls[0][0]).toEqual({
        where: { id: SPACE, userId: USER },
        select: { id: true, name: true, driveFolderId: true },
      });
    });

    it("không gian đã có thư mục → không tạo thư mục không gian, thư mục dự án nằm trong space.driveFolderId", async () => {
      arrangeCreate(0);
      space.findFirst.mockResolvedValue(SPACE_WITH_FOLDER);

      expect(await createProject(USER, SPACE, { name: "Mới" })).toEqual({ ok: true, project: CREATED });

      expect(provisionSpaceFolder).not.toHaveBeenCalled();
      expect(space.updateMany).not.toHaveBeenCalled();
      expect(space.findFirst).toHaveBeenCalledTimes(1);
      expect(provisionProjectFolder).toHaveBeenCalledTimes(1);
      expect(provisionProjectFolder).toHaveBeenCalledWith(USER, {
        spaceId: SPACE,
        parentFolderId: "f-space",
        project: { id: "new", name: "Mới" },
      });
      expect(db.$transaction.mock.invocationCallOrder[0]).toBeLessThan(
        provisionProjectFolder.mock.invocationCallOrder[0],
      );
      expect(tx.activity.createMany.mock.invocationCallOrder[0]).toBeLessThan(
        provisionProjectFolder.mock.invocationCallOrder[0],
      );
      // provisionProjectFolder trả null (mặc định) → không ghi project.
      expect(project.updateMany).not.toHaveBeenCalled();
    });

    it("projectFolderId → project.updateMany theo id + userId; client Project không có driveFolderId", async () => {
      arrangeCreate(0);
      space.findFirst.mockResolvedValue(SPACE_WITH_FOLDER);
      provisionProjectFolder.mockResolvedValue("f-project");
      project.updateMany.mockResolvedValue({ count: 1 });

      const result = await createProject(USER, SPACE, { name: "Mới" });

      expect(project.updateMany).toHaveBeenCalledTimes(1);
      expect(project.updateMany.mock.calls[0][0]).toEqual({
        where: { id: "new", userId: USER },
        data: { driveFolderId: "f-project" },
      });
      expect(result).toEqual({ ok: true, project: CREATED });
      expectAllWhereHaveUserId();
    });

    it("không gian chưa có thư mục → tạo, ghi có điều kiện, đọc lại, thư mục dự án nằm trong id đọc lại", async () => {
      arrangeFolderless({ driveFolderId: "f-space" });
      provisionSpaceFolder.mockResolvedValue("f-space");
      provisionProjectFolder.mockResolvedValue("f-project");
      space.updateMany.mockResolvedValue({ count: 1 });
      project.updateMany.mockResolvedValue({ count: 1 });

      const result = await createProject(USER, SPACE, { name: "Mới" });

      expect(result).toEqual({ ok: true, project: CREATED });
      expect(provisionSpaceFolder).toHaveBeenCalledTimes(1);
      expect(provisionSpaceFolder).toHaveBeenCalledWith(USER, { id: SPACE, name: "Không gian" });
      expect(space.updateMany).toHaveBeenCalledTimes(1);
      expect(space.updateMany.mock.calls[0][0]).toEqual({
        where: { id: SPACE, userId: USER, driveFolderId: null },
        data: { driveFolderId: "f-space" },
      });
      expect(space.findFirst).toHaveBeenCalledTimes(2);
      expect(space.findFirst.mock.calls[1][0]).toEqual({
        where: { id: SPACE, userId: USER },
        select: { driveFolderId: true },
      });
      expect(space.updateMany.mock.invocationCallOrder[0]).toBeLessThan(space.findFirst.mock.invocationCallOrder[1]);
      expect(space.findFirst.mock.invocationCallOrder[1]).toBeLessThan(
        provisionProjectFolder.mock.invocationCallOrder[0],
      );
      expect(provisionProjectFolder).toHaveBeenCalledWith(USER, {
        spaceId: SPACE,
        parentFolderId: "f-space",
        project: { id: "new", name: "Mới" },
      });
      expect(project.updateMany.mock.calls[0][0]).toEqual({
        where: { id: "new", userId: USER },
        data: { driveFolderId: "f-project" },
      });
      expectAllWhereHaveUserId();
    });

    it("đồng thời: ghi có điều kiện count 0, đọc lại ra id của request thắng → thư mục dự án nằm trong 'winner'", async () => {
      arrangeFolderless({ driveFolderId: "winner" });
      provisionSpaceFolder.mockResolvedValue("f-mine");
      provisionProjectFolder.mockResolvedValue("f-project");
      space.updateMany.mockResolvedValue({ count: 0 });
      project.updateMany.mockResolvedValue({ count: 1 });

      expect((await createProject(USER, SPACE, { name: "Mới" })).ok).toBe(true);

      expect(provisionProjectFolder).toHaveBeenCalledTimes(1);
      expect(provisionProjectFolder.mock.calls[0][1].parentFolderId).toBe("winner");
      expect(provisionProjectFolder.mock.calls[0][1].parentFolderId).not.toBe("f-mine");
      expect(project.updateMany.mock.calls[0][0].data).toEqual({ driveFolderId: "f-project" });
      expectAllWhereHaveUserId();
    });

    it("ghi id không gian lỗi → vẫn đọc lại và dùng id đã lưu (nếu có)", async () => {
      arrangeFolderless({ driveFolderId: "winner" });
      provisionSpaceFolder.mockResolvedValue("f-mine");
      space.updateMany.mockRejectedValue(new Error("SECRET"));
      const log = vi.spyOn(console, "error").mockImplementation(() => {});

      try {
        expect((await createProject(USER, SPACE, { name: "Mới" })).ok).toBe(true);
        expect(provisionProjectFolder.mock.calls[0][1].parentFolderId).toBe("winner");
        expect(log).toHaveBeenCalledTimes(1);
        expect(log.mock.calls[0]).toEqual([
          "[projects] Không lưu được driveFolderId",
          { userId: USER, spaceId: SPACE, projectId: "new", error: "Error" },
        ]);
        expect(JSON.stringify(log.mock.calls)).not.toContain("SECRET");
      } finally {
        log.mockRestore();
      }
    });

    it("provisionSpaceFolder trả null → không ghi, không đọc lại, không tạo thư mục dự án", async () => {
      arrangeFolderless({ driveFolderId: "f-space" });

      expect(await createProject(USER, SPACE, { name: "Mới" })).toEqual({ ok: true, project: CREATED });
      expect(provisionSpaceFolder).toHaveBeenCalledTimes(1);
      expect(space.updateMany).not.toHaveBeenCalled();
      expect(space.findFirst).toHaveBeenCalledTimes(1);
      expect(provisionProjectFolder).not.toHaveBeenCalled();
      expect(project.updateMany).not.toHaveBeenCalled();
    });

    it("đọc lại ném lỗi → không tạo thư mục dự án, log không lộ message", async () => {
      arrangeFolderless(Object.assign(new Error("SECRET"), { name: "PrismaClientKnownRequestError" }));
      provisionSpaceFolder.mockResolvedValue("f-space");
      space.updateMany.mockResolvedValue({ count: 1 });
      const log = vi.spyOn(console, "error").mockImplementation(() => {});

      try {
        expect(await createProject(USER, SPACE, { name: "Mới" })).toEqual({ ok: true, project: CREATED });
        expect(provisionProjectFolder).not.toHaveBeenCalled();
        expect(project.updateMany).not.toHaveBeenCalled();
        expect(log).toHaveBeenCalledTimes(1);
        expect(log.mock.calls[0][1]).toEqual({
          userId: USER,
          spaceId: SPACE,
          projectId: "new",
          error: "PrismaClientKnownRequestError",
        });
        expect(JSON.stringify(log.mock.calls)).not.toContain("SECRET");
      } finally {
        log.mockRestore();
      }
    });

    it("đọc lại trả null (không gian bị xoá) → không tạo thư mục dự án", async () => {
      arrangeFolderless(null);
      provisionSpaceFolder.mockResolvedValue("f-space");
      space.updateMany.mockResolvedValue({ count: 0 });

      expect((await createProject(USER, SPACE, { name: "Mới" })).ok).toBe(true);
      expect(provisionProjectFolder).not.toHaveBeenCalled();
      expect(project.updateMany).not.toHaveBeenCalled();
    });

    it("đọc lại vẫn driveFolderId null → không tạo thư mục dự án", async () => {
      arrangeFolderless({ driveFolderId: null });
      provisionSpaceFolder.mockResolvedValue("f-space");
      space.updateMany.mockResolvedValue({ count: 0 });

      expect((await createProject(USER, SPACE, { name: "Mới" })).ok).toBe(true);
      expect(provisionProjectFolder).not.toHaveBeenCalled();
    });

    it("ghi id dự án lỗi → vẫn ok, activity vẫn ghi, log không lộ message", async () => {
      arrangeCreate(0);
      space.findFirst.mockResolvedValue(SPACE_WITH_FOLDER);
      provisionProjectFolder.mockResolvedValue("f-project");
      project.updateMany.mockRejectedValue(Object.assign(new Error("SECRET"), { name: "PrismaClientKnownRequestError" }));
      const log = vi.spyOn(console, "error").mockImplementation(() => {});

      try {
        const result = await createProject(USER, SPACE, { name: "Mới" }, NOW);

        expect(result).toEqual({ ok: true, project: CREATED });
        expect(tx.activity.createMany).toHaveBeenCalledTimes(1);
        expect(project.updateMany).toHaveBeenCalledTimes(1);
        expect(log).toHaveBeenCalledTimes(1);
        expect(log.mock.calls[0]).toEqual([
          "[projects] Không lưu được driveFolderId",
          { userId: USER, spaceId: SPACE, projectId: "new", error: "PrismaClientKnownRequestError" },
        ]);
        expect(JSON.stringify(log.mock.calls)).not.toContain("SECRET");
      } finally {
        log.mockRestore();
      }
    });

    it("lỗi ném ra không phải Error → log error: unknown", async () => {
      arrangeCreate(0);
      space.findFirst.mockResolvedValue(SPACE_WITH_FOLDER);
      provisionProjectFolder.mockResolvedValue("f-project");
      project.updateMany.mockRejectedValue("SECRET");
      const log = vi.spyOn(console, "error").mockImplementation(() => {});

      try {
        expect((await createProject(USER, SPACE, { name: "Mới" })).ok).toBe(true);
        expect(log.mock.calls[0][1]).toEqual({ userId: USER, spaceId: SPACE, projectId: "new", error: "unknown" });
        expect(JSON.stringify(log.mock.calls)).not.toContain("SECRET");
      } finally {
        log.mockRestore();
      }
    });
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
