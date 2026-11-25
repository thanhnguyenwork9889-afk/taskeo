import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dueDateFromDb, dueDateToDb, projectFromRecord, type ProjectRecord } from "./project-record";
import { projectSchema } from "./validation";

const FULL_RECORD: ProjectRecord = {
  id: "pr_1",
  spaceId: "sp_1",
  name: "Đồ án tốt nghiệp",
  description: "Viết báo cáo",
  status: "ON_HOLD",
  dueDate: new Date("2026-03-01T00:00:00.000Z"),
};

const TIME_ZONES = ["UTC", "Asia/Ho_Chi_Minh", "America/Los_Angeles"];

describe("dueDate conversion across time zones", () => {
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

  it("writes YYYY-MM-DD as UTC midnight regardless of TZ", () => {
    for (const tz of TIME_ZONES) {
      process.env.TZ = tz;
      expect(dueDateToDb("2026-03-01")?.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    }
  });

  it("reads a UTC-midnight Date back as the same day regardless of TZ", () => {
    for (const tz of TIME_ZONES) {
      process.env.TZ = tz;
      expect(dueDateFromDb(new Date("2026-03-01T00:00:00.000Z"))).toBe("2026-03-01");
      expect(dueDateFromDb(new Date("2026-12-31T00:00:00.000Z"))).toBe("2026-12-31");
    }
  });

  it("round-trips string → Date → string unchanged in every TZ", () => {
    for (const tz of TIME_ZONES) {
      process.env.TZ = tz;
      for (const day of ["2026-01-01", "2026-02-28", "2028-02-29", "2026-12-31"]) {
        expect(dueDateFromDb(dueDateToDb(day))).toBe(day);
      }
    }
  });

  it("maps a record dueDate to the same day in every TZ", () => {
    for (const tz of TIME_ZONES) {
      process.env.TZ = tz;
      expect(projectFromRecord(FULL_RECORD).dueDate).toBe("2026-03-01");
    }
  });
});

describe("dueDateToDb / dueDateFromDb", () => {
  it("passes null through in both directions", () => {
    expect(dueDateToDb(null)).toBeNull();
    expect(dueDateFromDb(null)).toBeNull();
  });
});

describe("projectFromRecord", () => {
  it("maps every field", () => {
    expect(projectFromRecord(FULL_RECORD)).toEqual({
      id: "pr_1",
      spaceId: "sp_1",
      name: "Đồ án tốt nghiệp",
      description: "Viết báo cáo",
      status: "ON_HOLD",
      dueDate: "2026-03-01",
    });
  });

  it("turns a null description into an empty string", () => {
    expect(projectFromRecord({ ...FULL_RECORD, description: null }).description).toBe("");
  });

  it("keeps a null dueDate as null", () => {
    expect(projectFromRecord({ ...FULL_RECORD, dueDate: null }).dueDate).toBeNull();
  });

  it("falls back to ACTIVE when status is unknown", () => {
    for (const status of ["PAUSED", "", "   ", "active"]) {
      expect(projectFromRecord({ ...FULL_RECORD, status }).status).toBe("ACTIVE");
    }
  });

  it("drops extra record fields such as userId, order and driveFolderId", () => {
    const record = { ...FULL_RECORD, userId: "user_1", order: 2, driveFolderId: "drive_1", createdAt: new Date() };
    const project = projectFromRecord(record);
    expect(Object.keys(project).sort()).toEqual(["description", "dueDate", "id", "name", "spaceId", "status"]);
  });

  it("produces output accepted by projectSchema", () => {
    const records = [FULL_RECORD, { ...FULL_RECORD, description: null, dueDate: null, status: "weird" }];
    for (const record of records) {
      const project = projectFromRecord(record);
      expect(projectSchema.parse(project)).toEqual(project);
    }
  });

  it("does not mutate the input record", () => {
    const record = { ...FULL_RECORD, description: null };
    const snapshot = { ...record };
    projectFromRecord(record);
    expect(record).toEqual(snapshot);
  });
});
