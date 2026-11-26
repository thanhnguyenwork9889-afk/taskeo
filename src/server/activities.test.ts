import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityRecord } from "@/domain/activity-record";
import { ACTIVITY_MESSAGE } from "@/domain/labels";

const db = vi.hoisted(() => ({
  activity: { findMany: vi.fn() },
}));

vi.mock("@/server/db", () => ({ prisma: db }));

import { listActivities } from "./activities";

const USER = "user-1";
const CREATED = new Date("2026-11-25T08:00:00.000Z");
const { activity } = db;

function record(overrides: Partial<ActivityRecord> = {}): ActivityRecord {
  return {
    id: "a1",
    type: "task_created",
    entityId: "t1",
    meta: { message: "Đã tạo công việc Việc" },
    createdAt: CREATED,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("listActivities", () => {
  it("lọc theo userId, sắp xếp mới nhất trước, cắt theo limit và chỉ chọn 5 cột", async () => {
    activity.findMany.mockResolvedValue([]);

    await listActivities(USER, 25);

    expect(activity.findMany).toHaveBeenCalledTimes(1);
    expect(activity.findMany).toHaveBeenCalledWith({
      where: { userId: USER },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 25,
      select: { id: true, type: true, entityId: true, meta: true, createdAt: true },
    });
    const args = activity.findMany.mock.calls[0][0] as { select: Record<string, unknown> };
    expect(args.select).not.toHaveProperty("userId");
  });

  it("trả mảng rỗng khi không có bản ghi", async () => {
    activity.findMany.mockResolvedValue([]);

    await expect(listActivities(USER, 50)).resolves.toEqual([]);
  });

  it("loại bản ghi có type lạ và giữ nguyên thứ tự còn lại", async () => {
    activity.findMany.mockResolvedValue([
      record({ id: "a3", type: "task_done" }),
      record({ id: "a2", type: "unknown_type" }),
      record({ id: "a1", type: "task_created" }),
    ]);

    const result = await listActivities(USER, 50);

    expect(result.map((item) => item.id)).toEqual(["a3", "a1"]);
  });

  it("kết quả chỉ có 5 trường, không lộ userId hay meta", async () => {
    activity.findMany.mockResolvedValue([{ ...record(), userId: USER }]);

    const [item] = await listActivities(USER, 50);

    expect(Object.keys(item).sort()).toEqual(["createdAt", "entityId", "id", "message", "type"]);
    expect(item).not.toHaveProperty("userId");
    expect(item).not.toHaveProperty("meta");
  });

  it("lấy message từ meta, thiếu thì dùng câu mặc định theo type", async () => {
    activity.findMany.mockResolvedValue([
      record({ id: "a2", meta: { message: "Đã tạo công việc Viết báo cáo" } }),
      record({ id: "a1", type: "task_done", meta: null }),
    ]);

    const result = await listActivities(USER, 50);

    expect(result).toEqual([
      {
        id: "a2",
        type: "task_created",
        entityId: "t1",
        message: "Đã tạo công việc Viết báo cáo",
        createdAt: CREATED.toISOString(),
      },
      {
        id: "a1",
        type: "task_done",
        entityId: "t1",
        message: ACTIVITY_MESSAGE.task_done,
        createdAt: CREATED.toISOString(),
      },
    ]);
  });
});
