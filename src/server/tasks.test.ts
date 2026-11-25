import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskRecord } from "@/domain/task-record";

const db = vi.hoisted(() => ({
  space: { findFirst: vi.fn() },
  project: { findFirst: vi.fn() },
  task: {
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

import { createTask, deleteTask, getTask, listTasks, MAX_TASKS_PER_USER, updateTask } from "./tasks";

const USER = "user-1";
const NOW = new Date("2026-11-25T08:00:00.000Z");
const CREATED = new Date("2026-11-01T00:00:00.000Z");
const { space, project, task } = db;

const TASK_SELECT = {
  id: true,
  spaceId: true,
  projectId: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  dueDate: true,
  completedAt: true,
  calendarEventId: true,
  createdAt: true,
  updatedAt: true,
};

function record(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: "t1",
    spaceId: "s1",
    projectId: null,
    title: "Việc",
    description: null,
    status: "TODO",
    priority: "MEDIUM",
    dueDate: null,
    completedAt: null,
    calendarEventId: null,
    createdAt: CREATED,
    updatedAt: CREATED,
    ...overrides,
  };
}

function prismaError(code: string): Error {
  return Object.assign(new Error(`Prisma ${code}`), { code });
}

/** Mọi lời gọi Prisma (trừ create, có userId trong data) phải lọc theo userId. */
function expectAllWhereHaveUserId(): void {
  const mocks = [
    space.findFirst,
    project.findFirst,
    task.findMany,
    task.findFirst,
    task.count,
    task.aggregate,
    task.updateMany,
    task.deleteMany,
  ];
  for (const mock of mocks) {
    for (const [args] of mock.mock.calls) {
      expect(args.where.userId).toBe(USER);
    }
  }
  for (const [args] of task.create.mock.calls) {
    expect(args.data.userId).toBe(USER);
  }
}

function expectNoUndefinedValues(data: Record<string, unknown>): void {
  for (const value of Object.values(data)) {
    expect(value).not.toBeUndefined();
  }
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("listTasks", () => {
  it("lọc theo userId, sắp order rồi createdAt, take = MAX_TASKS_PER_USER, trả Task", async () => {
    task.findMany.mockResolvedValue([record(), record({ id: "t2", description: "Mô tả", status: "lạ" })]);

    const result = await listTasks(USER, {});

    const args = task.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ userId: USER });
    expect(args.orderBy).toEqual([{ order: "asc" }, { createdAt: "asc" }]);
    expect(args.take).toBe(MAX_TASKS_PER_USER);
    expect(MAX_TASKS_PER_USER).toBe(2000);
    expect(args.select).toEqual(TASK_SELECT);
    expect(result).toHaveLength(2);
    expect(result[0].description).toBe("");
    expect(result[1]).toMatchObject({ id: "t2", description: "Mô tả", status: "TODO" });
    expectAllWhereHaveUserId();
  });

  it("chỉ thêm các khoá filter có mặt", async () => {
    task.findMany.mockResolvedValue([]);

    await listTasks(USER, { spaceId: "s1", status: "DONE" });
    await listTasks(USER, { projectId: "p1" });
    await listTasks(USER, { spaceId: undefined, projectId: undefined, status: undefined });

    expect(task.findMany.mock.calls[0][0].where).toEqual({ userId: USER, spaceId: "s1", status: "DONE" });
    expect(task.findMany.mock.calls[1][0].where).toEqual({ userId: USER, projectId: "p1" });
    expect(task.findMany.mock.calls[2][0].where).toEqual({ userId: USER });
    expect(Object.keys(task.findMany.mock.calls[2][0].where)).toEqual(["userId"]);
  });

  it("không gian / dự án của người khác → [] (không kiểm thêm)", async () => {
    task.findMany.mockResolvedValue([]);

    expect(await listTasks(USER, { spaceId: "s-other" })).toEqual([]);
    expect(space.findFirst).not.toHaveBeenCalled();
    expect(project.findFirst).not.toHaveBeenCalled();
  });
});

describe("getTask", () => {
  it("tìm theo id + userId, trả Task không có userId / order", async () => {
    task.findFirst.mockResolvedValue(record({ dueDate: new Date("2026-12-01T00:00:00.000Z") }));

    const result = await getTask(USER, "t1");

    expect(task.findFirst.mock.calls[0][0].where).toEqual({ id: "t1", userId: USER });
    expect(task.findFirst.mock.calls[0][0].select).toEqual(TASK_SELECT);
    expect(result).toEqual({
      id: "t1",
      spaceId: "s1",
      projectId: null,
      title: "Việc",
      description: "",
      status: "TODO",
      priority: "MEDIUM",
      dueDate: "2026-12-01",
      completedAt: null,
      addToCalendar: false,
      linkedFileIds: [],
      createdAt: CREATED.toISOString(),
      updatedAt: CREATED.toISOString(),
    });
    expect(result).not.toHaveProperty("userId");
    expect(result).not.toHaveProperty("order");
  });

  it("trả null khi công việc của người khác / không có", async () => {
    task.findFirst.mockResolvedValue(null);

    expect(await getTask(USER, "t-other")).toBeNull();
  });
});

describe("createTask", () => {
  function arrangeCreate(count = 3, maxOrder: number | null = null): void {
    task.count.mockResolvedValue(count);
    task.aggregate.mockResolvedValue({ _max: { order: maxOrder } });
    task.create.mockImplementation(async ({ data }) =>
      record({
        id: "new",
        spaceId: data.spaceId,
        projectId: data.projectId,
        title: data.title,
        description: data.description,
        status: data.status ?? "TODO",
        priority: data.priority ?? "MEDIUM",
        dueDate: data.dueDate ?? null,
        completedAt: data.completedAt,
      }),
    );
  }

  it("không có cả spaceId lẫn projectId → spaceId / projectId null, order 0, mô tả rỗng → null", async () => {
    arrangeCreate(0, null);

    const result = await createTask(USER, { title: "Việc", description: "" }, NOW);

    expect(space.findFirst).not.toHaveBeenCalled();
    expect(project.findFirst).not.toHaveBeenCalled();
    const args = task.create.mock.calls[0][0];
    expect(args.data).toEqual({
      userId: USER,
      spaceId: null,
      projectId: null,
      title: "Việc",
      description: null,
      completedAt: null,
      order: 0,
    });
    expect(args.select).toEqual(TASK_SELECT);
    expectNoUndefinedValues(args.data);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.task).toMatchObject({ id: "new", spaceId: null, projectId: null, description: "" });
      expect(result.task).not.toHaveProperty("userId");
      expect(result.task).not.toHaveProperty("order");
    }
    expectAllWhereHaveUserId();
  });

  it("order = max(order) + 1; count / aggregate lọc userId", async () => {
    arrangeCreate(5, 9);

    await createTask(USER, { title: "Việc" }, NOW);

    expect(task.count.mock.calls[0][0].where).toEqual({ userId: USER });
    expect(task.aggregate.mock.calls[0][0]).toEqual({ where: { userId: USER }, _max: { order: true } });
    expect(task.create.mock.calls[0][0].data.order).toBe(10);
  });

  it("chỉ gửi status / priority / dueDate khi có mặt; dueDate qua UTC", async () => {
    arrangeCreate();

    await createTask(USER, { title: "Việc", priority: "HIGH", status: "IN_PROGRESS", dueDate: "2026-12-01" }, NOW);

    const data = task.create.mock.calls[0][0].data;
    expect(data.priority).toBe("HIGH");
    expect(data.status).toBe("IN_PROGRESS");
    expect(data.dueDate).toEqual(new Date("2026-12-01T00:00:00.000Z"));
    expect(data.completedAt).toBeNull();
  });

  it("status DONE khi tạo → completedAt = now", async () => {
    arrangeCreate();

    const result = await createTask(USER, { title: "Việc", status: "DONE" }, NOW);

    expect(task.create.mock.calls[0][0].data.completedAt).toEqual(NOW);
    expect(result.ok && result.task.completedAt).toBe(NOW.toISOString());
  });

  it("chỉ projectId → spaceId theo dự án; kiểm dự án theo userId", async () => {
    arrangeCreate();
    project.findFirst.mockResolvedValue({ spaceId: "s9" });

    const result = await createTask(USER, { title: "Việc", projectId: "p1" }, NOW);

    expect(project.findFirst.mock.calls[0][0]).toEqual({ where: { id: "p1", userId: USER }, select: { spaceId: true } });
    expect(space.findFirst).not.toHaveBeenCalled();
    expect(task.create.mock.calls[0][0].data).toMatchObject({ projectId: "p1", spaceId: "s9" });
    expect(result.ok && result.task.spaceId).toBe("s9");
    expectAllWhereHaveUserId();
  });

  it("projectId + spaceId: null → spaceId theo dự án", async () => {
    arrangeCreate();
    project.findFirst.mockResolvedValue({ spaceId: "s9" });

    await createTask(USER, { title: "Việc", projectId: "p1", spaceId: null }, NOW);

    expect(task.create.mock.calls[0][0].data).toMatchObject({ projectId: "p1", spaceId: "s9" });
  });

  it("projectId + spaceId trùng không gian của dự án → hợp lệ", async () => {
    arrangeCreate();
    project.findFirst.mockResolvedValue({ spaceId: "s9" });

    const result = await createTask(USER, { title: "Việc", projectId: "p1", spaceId: "s9" }, NOW);

    expect(result.ok).toBe(true);
    expect(task.create.mock.calls[0][0].data).toMatchObject({ projectId: "p1", spaceId: "s9" });
  });

  it("spaceId khác không gian của dự án → space_mismatch, không tạo", async () => {
    project.findFirst.mockResolvedValue({ spaceId: "s9" });

    const result = await createTask(USER, { title: "Việc", projectId: "p1", spaceId: "s1" }, NOW);

    expect(result).toEqual({ ok: false, reason: "space_mismatch" });
    expect(task.create).not.toHaveBeenCalled();
  });

  it("dự án của người khác / không có → invalid_project, không tạo", async () => {
    project.findFirst.mockResolvedValue(null);

    const result = await createTask(USER, { title: "Việc", projectId: "p-other" }, NOW);

    expect(result).toEqual({ ok: false, reason: "invalid_project" });
    expect(task.create).not.toHaveBeenCalled();
    expectAllWhereHaveUserId();
  });

  it("chỉ spaceId của người dùng → projectId null; kiểm không gian theo userId", async () => {
    arrangeCreate();
    space.findFirst.mockResolvedValue({ id: "s1" });

    await createTask(USER, { title: "Việc", spaceId: "s1" }, NOW);

    expect(space.findFirst.mock.calls[0][0].where).toEqual({ id: "s1", userId: USER });
    expect(project.findFirst).not.toHaveBeenCalled();
    expect(task.create.mock.calls[0][0].data).toMatchObject({ spaceId: "s1", projectId: null });
    expectAllWhereHaveUserId();
  });

  it("không gian của người khác → invalid_space, không tạo", async () => {
    space.findFirst.mockResolvedValue(null);

    const result = await createTask(USER, { title: "Việc", spaceId: "s-other" }, NOW);

    expect(result).toEqual({ ok: false, reason: "invalid_space" });
    expect(task.create).not.toHaveBeenCalled();
  });

  it("projectId: null + spaceId: null → cả hai null, không kiểm gì", async () => {
    arrangeCreate();

    await createTask(USER, { title: "Việc", projectId: null, spaceId: null }, NOW);

    expect(space.findFirst).not.toHaveBeenCalled();
    expect(project.findFirst).not.toHaveBeenCalled();
    expect(task.create.mock.calls[0][0].data).toMatchObject({ spaceId: null, projectId: null });
  });

  it("đủ MAX_TASKS_PER_USER → limit, không tạo", async () => {
    arrangeCreate(MAX_TASKS_PER_USER);

    const result = await createTask(USER, { title: "Việc" }, NOW);

    expect(result).toEqual({ ok: false, reason: "limit" });
    expect(task.create).not.toHaveBeenCalled();
  });

  it("P2003 khi có projectId → invalid_project", async () => {
    arrangeCreate();
    project.findFirst.mockResolvedValue({ spaceId: "s9" });
    task.create.mockRejectedValue(prismaError("P2003"));

    expect(await createTask(USER, { title: "Việc", projectId: "p1" }, NOW)).toEqual({
      ok: false,
      reason: "invalid_project",
    });
  });

  it("P2003 khi chỉ có spaceId → invalid_space", async () => {
    arrangeCreate();
    space.findFirst.mockResolvedValue({ id: "s1" });
    task.create.mockRejectedValue(prismaError("P2003"));

    expect(await createTask(USER, { title: "Việc", spaceId: "s1" }, NOW)).toEqual({
      ok: false,
      reason: "invalid_space",
    });
  });

  it("lỗi khác ném tiếp", async () => {
    arrangeCreate();
    const error = prismaError("P1001");
    task.create.mockRejectedValue(error);

    await expect(createTask(USER, { title: "Việc" }, NOW)).rejects.toBe(error);
  });
});

describe("updateTask", () => {
  function arrangeUpdate(current: { status: string; completedAt: Date | null } = { status: "TODO", completedAt: null }): void {
    task.findFirst.mockResolvedValueOnce(current).mockResolvedValueOnce(record({ title: "Đã sửa" }));
    task.updateMany.mockResolvedValue({ count: 1 });
  }

  function updateData(): Record<string, unknown> {
    return task.updateMany.mock.calls[0][0].data;
  }

  it("đọc hiện trạng theo id + userId, một updateMany theo id + userId, đọc lại bằng getTask", async () => {
    arrangeUpdate();

    const result = await updateTask(USER, "t1", { title: "Đã sửa" }, NOW);

    expect(task.findFirst.mock.calls[0][0]).toEqual({
      where: { id: "t1", userId: USER },
      select: { status: true, completedAt: true },
    });
    expect(task.updateMany).toHaveBeenCalledTimes(1);
    expect(task.updateMany.mock.calls[0][0].where).toEqual({ id: "t1", userId: USER });
    expect(updateData()).toEqual({ title: "Đã sửa" });
    expect(task.findFirst.mock.calls[1][0]).toEqual({ where: { id: "t1", userId: USER }, select: TASK_SELECT });
    expect(result.ok && result.task.title).toBe("Đã sửa");
    if (result.ok) {
      expect(result.task).not.toHaveProperty("userId");
      expect(result.task).not.toHaveProperty("order");
    }
    expectAllWhereHaveUserId();
  });

  it("không gửi undefined, không có completedAt khi không đổi status; mô tả rỗng → null", async () => {
    arrangeUpdate({ status: "DONE", completedAt: CREATED });

    await updateTask(USER, "t1", { description: "", priority: "LOW", dueDate: null }, NOW);

    expect(updateData()).toEqual({ description: null, priority: "LOW", dueDate: null });
    expect(updateData()).not.toHaveProperty("completedAt");
    expectNoUndefinedValues(updateData());
  });

  it("bỏ khoá lạ (không spread input)", async () => {
    arrangeUpdate();
    const input = { title: "Đã sửa", userId: "other", spaceId: "s-x" } as unknown as Parameters<typeof updateTask>[2];

    await updateTask(USER, "t1", input, NOW);

    expect(updateData()).toEqual({ title: "Đã sửa" });
  });

  it("dueDate qua UTC", async () => {
    arrangeUpdate();

    await updateTask(USER, "t1", { dueDate: "2026-12-01" }, NOW);

    expect(updateData()).toEqual({ dueDate: new Date("2026-12-01T00:00:00.000Z") });
  });

  it("TODO → DONE → completedAt = now", async () => {
    arrangeUpdate();

    await updateTask(USER, "t1", { status: "DONE" }, NOW);

    expect(updateData()).toEqual({ status: "DONE", completedAt: NOW });
  });

  it("DONE → TODO → completedAt: null", async () => {
    arrangeUpdate({ status: "DONE", completedAt: CREATED });

    await updateTask(USER, "t1", { status: "TODO" }, NOW);

    expect(updateData()).toEqual({ status: "TODO", completedAt: null });
  });

  it("DONE → DONE giữ completedAt cũ", async () => {
    arrangeUpdate({ status: "DONE", completedAt: CREATED });

    await updateTask(USER, "t1", { status: "DONE" }, NOW);

    expect(updateData()).toEqual({ status: "DONE", completedAt: CREATED });
  });

  it("projectId mới → spaceId theo dự án; kiểm dự án theo userId", async () => {
    arrangeUpdate();
    project.findFirst.mockResolvedValue({ spaceId: "s9" });

    await updateTask(USER, "t1", { projectId: "p2" }, NOW);

    expect(project.findFirst.mock.calls[0][0]).toEqual({ where: { id: "p2", userId: USER }, select: { spaceId: true } });
    expect(updateData()).toEqual({ projectId: "p2", spaceId: "s9" });
    expectAllWhereHaveUserId();
  });

  it("projectId: null → chỉ projectId null, không đụng spaceId", async () => {
    arrangeUpdate();

    await updateTask(USER, "t1", { projectId: null }, NOW);

    expect(project.findFirst).not.toHaveBeenCalled();
    expect(updateData()).toEqual({ projectId: null });
    expect(updateData()).not.toHaveProperty("spaceId");
  });

  it("dự án của người khác → invalid_project, không gọi updateMany", async () => {
    arrangeUpdate();
    project.findFirst.mockResolvedValue(null);

    const result = await updateTask(USER, "t1", { projectId: "p-other" }, NOW);

    expect(result).toEqual({ ok: false, reason: "invalid_project" });
    expect(task.updateMany).not.toHaveBeenCalled();
  });

  it("công việc của người khác / không có → not_found, không gọi updateMany", async () => {
    task.findFirst.mockResolvedValue(null);

    const result = await updateTask(USER, "t-other", { title: "x" }, NOW);

    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(task.updateMany).not.toHaveBeenCalled();
    expectAllWhereHaveUserId();
  });

  it("updateMany count 0 → not_found", async () => {
    task.findFirst.mockResolvedValueOnce({ status: "TODO", completedAt: null });
    task.updateMany.mockResolvedValue({ count: 0 });

    expect(await updateTask(USER, "t1", { title: "x" }, NOW)).toEqual({ ok: false, reason: "not_found" });
    expect(task.findFirst).toHaveBeenCalledTimes(1);
  });

  it("đọc lại không thấy (bị xoá giữa chừng) → not_found", async () => {
    task.findFirst.mockResolvedValueOnce({ status: "TODO", completedAt: null }).mockResolvedValueOnce(null);
    task.updateMany.mockResolvedValue({ count: 1 });

    expect(await updateTask(USER, "t1", { title: "x" }, NOW)).toEqual({ ok: false, reason: "not_found" });
  });

  it("P2003 → invalid_project", async () => {
    task.findFirst.mockResolvedValueOnce({ status: "TODO", completedAt: null });
    project.findFirst.mockResolvedValue({ spaceId: "s9" });
    task.updateMany.mockRejectedValue(prismaError("P2003"));

    expect(await updateTask(USER, "t1", { projectId: "p2" }, NOW)).toEqual({ ok: false, reason: "invalid_project" });
  });

  it("lỗi khác ném tiếp", async () => {
    task.findFirst.mockResolvedValueOnce({ status: "TODO", completedAt: null });
    const error = prismaError("P2025");
    task.updateMany.mockRejectedValue(error);

    await expect(updateTask(USER, "t1", { title: "x" }, NOW)).rejects.toBe(error);
  });
});

describe("deleteTask", () => {
  it("deleteMany theo id + userId, true khi xoá được", async () => {
    task.deleteMany.mockResolvedValue({ count: 1 });

    expect(await deleteTask(USER, "t1")).toBe(true);
    expect(task.deleteMany.mock.calls[0][0]).toEqual({ where: { id: "t1", userId: USER } });
  });

  it("false khi công việc của người khác / không có", async () => {
    task.deleteMany.mockResolvedValue({ count: 0 });

    expect(await deleteTask(USER, "t-other")).toBe(false);
    expectAllWhereHaveUserId();
  });
});
