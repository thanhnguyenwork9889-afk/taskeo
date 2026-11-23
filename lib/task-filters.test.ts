import { describe, expect, it } from "vitest";
import { createSeedState } from "./seed";
import { completionsByDay, summarizeTasks } from "./stats";
import { EMPTY_FILTERS, filterTasks } from "./task-filters";
import { driveUrlSchema } from "./validation";
import { toggleTaskDone } from "./workspace-actions";

const NOW = new Date(2026, 10, 23, 9, 0);
const TODAY = "2026-11-23";
const state = createSeedState(NOW);
const context = { today: TODAY, globalQuery: "", spaces: state.spaces, projects: state.projects };

describe("filterTasks", () => {
  it("returns every task with empty filters", () => {
    expect(filterTasks(state.tasks, EMPTY_FILTERS, context)).toHaveLength(state.tasks.length);
  });

  it("filters overdue tasks", () => {
    const result = filterTasks(state.tasks, { ...EMPTY_FILTERS, due: "overdue" }, context);
    expect(result.map((t) => t.id)).toEqual(["t-9"]);
  });

  it("combines the global query and the page search, matching project names", () => {
    const result = filterTasks(state.tasks, { ...EMPTY_FILTERS, search: "blog" }, { ...context, globalQuery: "xu hướng" });
    expect(result.map((t) => t.id)).toEqual(["t-103"]);
  });
});

describe("stats", () => {
  it("counts completions per day for the last 7 days", () => {
    const history = completionsByDay(state.activities, state.tasks, TODAY);
    expect(history).toHaveLength(7);
    expect(history.map((d) => d.count)).toEqual([2, 4, 3, 6, 4, 5, 7]);
    expect(history.at(-1)?.label).toBe("Nay");
  });

  it("counts a task toggled done twice once, and drops reopened tasks", () => {
    let next = toggleTaskDone(state, "t-2", NOW); // done
    next = toggleTaskDone(next, "t-2", NOW); // reopened
    expect(completionsByDay(next.activities, next.tasks, TODAY).at(-1)?.count).toBe(7);
    next = toggleTaskDone(next, "t-2", NOW); // done again
    expect(completionsByDay(next.activities, next.tasks, TODAY).at(-1)?.count).toBe(8);
  });

  it("summarizes task progress", () => {
    const summary = summarizeTasks(state.tasks, TODAY);
    expect(summary).toMatchObject({ total: 15, done: 7, overdue: 1, percent: 47 });
  });
});

describe("driveUrlSchema", () => {
  it("accepts HTTPS Google Drive links only", () => {
    expect(driveUrlSchema.safeParse("https://docs.google.com/document/d/abc").success).toBe(true);
    expect(driveUrlSchema.safeParse("http://docs.google.com/document/d/abc").success).toBe(false);
    expect(driveUrlSchema.safeParse("https://evil.example.com/docs.google.com").success).toBe(false);
    expect(driveUrlSchema.safeParse("không phải url").success).toBe(false);
  });
});
