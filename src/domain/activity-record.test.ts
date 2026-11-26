import { describe, expect, it } from "vitest";
import { activityFromRecord, taskActivityTypes, type ActivityRecord } from "./activity-record";
import type { TaskStatus } from "./types";
import { activitySchema } from "./validation";

const CREATED_AT = new Date("2026-11-26T08:30:00.000Z");

const RECORD: ActivityRecord = {
  id: "act_1",
  type: "task_done",
  entityId: "t_1",
  meta: { message: "Hoàn thành: Nộp báo cáo" },
  createdAt: CREATED_AT,
};

describe("activityFromRecord", () => {
  it("giữ meta.message khi là chuỗi khác rỗng và trả đúng 5 trường", () => {
    const result = activityFromRecord(RECORD);
    expect(result).toEqual({
      id: "act_1",
      type: "task_done",
      entityId: "t_1",
      message: "Hoàn thành: Nộp báo cáo",
      createdAt: "2026-11-26T08:30:00.000Z",
    });
    expect(Object.keys(result ?? {}).sort()).toEqual(["createdAt", "entityId", "id", "message", "type"]);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["chuỗi", "Tạo công việc khác"],
    ["số", 5],
    ["mảng", ["x"]],
    ["không có message", {}],
    ["message là số", { message: 5 }],
    ["message rỗng", { message: "" }],
    ["message toàn khoảng trắng", { message: "   " }],
  ])("meta %s → câu mặc định theo type", (_label, meta) => {
    const result = activityFromRecord({ ...RECORD, meta });
    expect(result?.message).toBe("Hoàn thành công việc");
  });

  it("dùng câu mặc định đúng theo từng type", () => {
    expect(activityFromRecord({ ...RECORD, type: "task_created", meta: null })?.message).toBe("Tạo công việc");
    expect(activityFromRecord({ ...RECORD, type: "project_created", meta: null })?.message).toBe("Tạo dự án");
  });

  it.each(["unknown", "", "TASK_DONE", "constructor"])("type lạ %j → null", (type) => {
    expect(activityFromRecord({ ...RECORD, type })).toBeNull();
  });

  it("giữ entityId null", () => {
    expect(activityFromRecord({ ...RECORD, entityId: null })?.entityId).toBeNull();
  });

  it("không lộ meta, userId hay trường thừa của bản ghi", () => {
    const withExtra = { ...RECORD, userId: "u_1", meta: { message: "x", secret: "y" } };
    const result = activityFromRecord(withExtra);
    expect(result).not.toHaveProperty("meta");
    expect(result).not.toHaveProperty("userId");
    expect(Object.keys(result ?? {})).toHaveLength(5);
  });

  it("kết quả hợp lệ theo activitySchema", () => {
    const result = activityFromRecord({ ...RECORD, meta: null, entityId: null });
    expect(() => activitySchema.parse(result)).not.toThrow();
  });

  it("không sửa bản ghi đầu vào", () => {
    const meta = { message: "  giữ  " };
    const record: ActivityRecord = { ...RECORD, meta };
    const snapshot = structuredClone(record);
    activityFromRecord(record);
    expect(record).toEqual(snapshot);
  });
});

describe("taskActivityTypes", () => {
  it.each<[string, TaskStatus | null, TaskStatus | undefined, string[]]>([
    ["tạo TODO", null, "TODO", ["task_created"]],
    ["tạo DONE", null, "DONE", ["task_created", "task_done"]],
    ["tạo không có status", null, undefined, ["task_created"]],
    ["TODO → DONE", "TODO", "DONE", ["task_done"]],
    ["PAUSED → DONE", "PAUSED", "DONE", ["task_done"]],
    ["DONE → DONE", "DONE", "DONE", []],
    ["sửa không có status", "TODO", undefined, []],
    ["DONE → TODO", "DONE", "TODO", []],
    ["IN_PROGRESS → PAUSED", "IN_PROGRESS", "PAUSED", []],
  ])("%s", (_label, previous, next, expected) => {
    expect(taskActivityTypes(previous, next)).toEqual(expected);
  });

  it("trả mảng mới mỗi lần gọi", () => {
    const first = taskActivityTypes(null, "DONE");
    const second = taskActivityTypes(null, "DONE");
    expect(first).not.toBe(second);
    expect(taskActivityTypes("TODO", "TODO")).not.toBe(taskActivityTypes("TODO", "TODO"));
  });
});
