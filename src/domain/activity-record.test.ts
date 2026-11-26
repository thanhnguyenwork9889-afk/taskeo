import { describe, expect, it } from "vitest";
import {
  ACTIVITY_MESSAGE_MAX,
  activityFromRecord,
  activityRows,
  taskActivityTypes,
  type ActivityRecord,
} from "./activity-record";
import type { ActivityType, TaskStatus } from "./types";
import { activitySchema } from "./validation";

const CREATED_AT = new Date("2026-11-26T08:30:00.000Z");
const NOW = new Date("2026-11-26T09:00:00.000Z");

const RECORD: ActivityRecord = {
  id: "act_1",
  type: "task_done",
  entityId: "t_1",
  meta: { message: "Hoàn thành: Nộp báo cáo" },
  createdAt: CREATED_AT,
};

const EMOJI = "\u{1F600}";

function messageOf(message: string): string | undefined {
  return activityFromRecord({ ...RECORD, meta: { message } })?.message;
}

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

  it("ACTIVITY_MESSAGE_MAX là 200", () => {
    expect(ACTIVITY_MESSAGE_MAX).toBe(200);
  });

  it("message dài đúng 200 ký tự → giữ nguyên", () => {
    const message = "a".repeat(200);
    expect(messageOf(message)).toBe(message);
  });

  it("message 201 ký tự → cắt còn 200", () => {
    expect(messageOf("b".repeat(201))).toBe("b".repeat(200));
  });

  it("emoji ở ranh giới 200 không bị cắt đôi (đếm theo code point)", () => {
    const result = messageOf("c".repeat(199) + EMOJI + EMOJI) ?? "";
    expect(result).toBe("c".repeat(199) + EMOJI);
    expect(Array.from(result)).toHaveLength(200);
  });

  it("200 emoji (400 đơn vị UTF-16) → giữ nguyên", () => {
    const message = EMOJI.repeat(200);
    expect(messageOf(message)).toBe(message);
  });

  it("message dài nhưng chỉ khoảng trắng → câu mặc định", () => {
    expect(messageOf(" ".repeat(300))).toBe("Hoàn thành công việc");
  });

  it("không sửa bản ghi đầu vào", () => {
    const meta = { message: "  giữ  " };
    const record: ActivityRecord = { ...RECORD, meta };
    const snapshot = structuredClone(record);
    activityFromRecord(record);
    expect(record).toEqual(snapshot);
  });

  it("không sửa meta khi cắt message dài", () => {
    const meta = { message: "d".repeat(250) };
    activityFromRecord({ ...RECORD, meta });
    expect(meta.message).toHaveLength(250);
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

describe("activityRows", () => {
  it("không có type → mảng rỗng", () => {
    expect(activityRows("u_1", "t_1", [], NOW)).toEqual([]);
  });

  it("một type → một dòng đủ userId, entityId, createdAt, message theo type", () => {
    expect(activityRows("u_1", "t_1", ["task_created"], NOW)).toEqual([
      { userId: "u_1", type: "task_created", entityId: "t_1", meta: { message: "Tạo công việc" }, createdAt: NOW },
    ]);
  });

  it("hai type → hai dòng đúng thứ tự, message theo từng type", () => {
    expect(activityRows("u_2", "p_9", ["project_created", "task_done"], NOW)).toEqual([
      { userId: "u_2", type: "project_created", entityId: "p_9", meta: { message: "Tạo dự án" }, createdAt: NOW },
      { userId: "u_2", type: "task_done", entityId: "p_9", meta: { message: "Hoàn thành công việc" }, createdAt: NOW },
    ]);
  });

  it("trả mảng mới, không sửa mảng types đầu vào", () => {
    const types: ActivityType[] = ["task_created"];
    const rows = activityRows("u_1", "t_1", types, NOW);
    expect(rows).not.toBe(types);
    expect(types).toEqual(["task_created"]);
    expect(activityRows("u_1", "t_1", [], NOW)).not.toBe(activityRows("u_1", "t_1", [], NOW));
  });
});
