import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { taskFromRecord, type TaskRecord } from "./task-record";
import { taskSchema } from "./validation";

const FULL_RECORD: TaskRecord = {
  id: "t_1",
  spaceId: "sp_1",
  projectId: "pr_1",
  title: "Nộp báo cáo",
  description: "Chương 1",
  status: "DONE",
  priority: "HIGH",
  dueDate: new Date("2026-03-01T00:00:00.000Z"),
  completedAt: new Date("2026-02-28T23:30:00.000Z"),
  calendarEventId: "evt_1",
  createdAt: new Date("2026-01-01T00:15:00.000Z"),
  updatedAt: new Date("2026-02-28T23:30:00.000Z"),
};

const EMPTY_RECORD: TaskRecord = {
  ...FULL_RECORD,
  spaceId: null,
  projectId: null,
  description: null,
  status: "TODO",
  priority: "MEDIUM",
  dueDate: null,
  completedAt: null,
  calendarEventId: null,
};

const TIME_ZONES = ["UTC", "Asia/Ho_Chi_Minh", "America/Los_Angeles"];

const TASK_KEYS = [
  "addToCalendar",
  "completedAt",
  "createdAt",
  "description",
  "dueDate",
  "id",
  "linkedFileIds",
  "priority",
  "projectId",
  "spaceId",
  "status",
  "title",
  "updatedAt",
];

describe("taskFromRecord across time zones", () => {
  let originalTz: string | undefined;

  beforeEach(() => {
    originalTz = process.env.TZ;
  });

  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it("actually changes the local time zone of Date when TZ is set", () => {
    const instant = new Date("2026-03-01T00:00:00.000Z");
    process.env.TZ = "America/Los_Angeles";
    expect(instant.getDate()).toBe(28);
    process.env.TZ = "Asia/Ho_Chi_Minh";
    expect(instant.getDate()).toBe(1);
  });

  it("maps dueDate and ISO timestamps identically in every TZ", () => {
    for (const tz of TIME_ZONES) {
      process.env.TZ = tz;
      const task = taskFromRecord(FULL_RECORD);
      expect(task.dueDate).toBe("2026-03-01");
      expect(task.completedAt).toBe("2026-02-28T23:30:00.000Z");
      expect(task.createdAt).toBe("2026-01-01T00:15:00.000Z");
      expect(task.updatedAt).toBe("2026-02-28T23:30:00.000Z");
    }
  });
});

describe("taskFromRecord", () => {
  it("maps every field", () => {
    expect(taskFromRecord(FULL_RECORD)).toEqual({
      id: "t_1",
      spaceId: "sp_1",
      projectId: "pr_1",
      title: "Nộp báo cáo",
      description: "Chương 1",
      status: "DONE",
      priority: "HIGH",
      dueDate: "2026-03-01",
      completedAt: "2026-02-28T23:30:00.000Z",
      addToCalendar: true,
      linkedFileIds: [],
      createdAt: "2026-01-01T00:15:00.000Z",
      updatedAt: "2026-02-28T23:30:00.000Z",
    });
  });

  it("passes nullable fields through and turns a null description into an empty string", () => {
    const task = taskFromRecord(EMPTY_RECORD);
    expect(task.spaceId).toBeNull();
    expect(task.projectId).toBeNull();
    expect(task.dueDate).toBeNull();
    expect(task.completedAt).toBeNull();
    expect(task.description).toBe("");
  });

  it("sets addToCalendar from calendarEventId", () => {
    expect(taskFromRecord(FULL_RECORD).addToCalendar).toBe(true);
    expect(taskFromRecord(EMPTY_RECORD).addToCalendar).toBe(false);
  });

  it("always returns an empty linkedFileIds array", () => {
    expect(taskFromRecord(FULL_RECORD).linkedFileIds).toEqual([]);
  });

  it("falls back to TODO when status is unknown", () => {
    for (const status of ["ARCHIVED", "", "   ", "done"]) {
      expect(taskFromRecord({ ...FULL_RECORD, status }).status).toBe("TODO");
    }
  });

  it("falls back to MEDIUM when priority is unknown", () => {
    for (const priority of ["CRITICAL", "", "   ", "high"]) {
      expect(taskFromRecord({ ...FULL_RECORD, priority }).priority).toBe("MEDIUM");
    }
  });

  it("drops extra record fields such as userId and order", () => {
    const record = { ...FULL_RECORD, userId: "user_1", order: 3 };
    const task = taskFromRecord(record);
    expect(Object.keys(task).sort()).toEqual(TASK_KEYS);
    expect(task).not.toHaveProperty("userId");
    expect(task).not.toHaveProperty("order");
    expect(task).not.toHaveProperty("calendarEventId");
  });

  it("produces output accepted by taskSchema", () => {
    const records = [FULL_RECORD, EMPTY_RECORD, { ...FULL_RECORD, status: "weird", priority: "weird" }];
    for (const record of records) {
      const task = taskFromRecord(record);
      expect(taskSchema.parse(task)).toEqual(task);
    }
  });

  it("does not mutate the input record", () => {
    const record = { ...FULL_RECORD, description: null };
    const snapshot = { ...record };
    taskFromRecord(record);
    expect(record).toEqual(snapshot);
  });
});
