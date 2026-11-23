import { describe, expect, it } from "vitest";
import { addDays, isOverdue, relativeDayLabel, toISODate } from "./dates";

describe("dates", () => {
  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("formats local dates as YYYY-MM-DD", () => {
    expect(toISODate(new Date(2026, 10, 5, 23, 59))).toBe("2026-11-05");
  });

  it("treats only unfinished tasks with a past due date as overdue", () => {
    const today = "2026-11-23";
    expect(isOverdue({ status: "TODO", dueDate: "2026-11-22" }, today)).toBe(true);
    expect(isOverdue({ status: "DONE", dueDate: "2026-11-22" }, today)).toBe(false);
    expect(isOverdue({ status: "TODO", dueDate: today }, today)).toBe(false);
    expect(isOverdue({ status: "TODO", dueDate: null }, today)).toBe(false);
  });

  it("labels nearby days relative to today", () => {
    expect(relativeDayLabel("2026-11-23", "2026-11-23")).toBe("Hôm nay");
    expect(relativeDayLabel("2026-11-24", "2026-11-23")).toBe("Ngày mai");
    expect(relativeDayLabel("2026-11-22", "2026-11-23")).toBe("Hôm qua");
  });
});
