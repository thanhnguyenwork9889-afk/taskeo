import { describe, expect, it } from "vitest";
import { createSeedState } from "./seed";
import { createProject, createTask, kindFromDriveUrl, toggleTaskDone, updateTask } from "./workspace-actions";
import { workspaceStateSchema } from "./validation";

const NOW = new Date(2026, 10, 23, 9, 0);

describe("workspace actions", () => {
  it("seed data passes the storage schema", () => {
    expect(workspaceStateSchema.safeParse(createSeedState(NOW)).success).toBe(true);
  });

  it("creates a task without mutating the previous state", () => {
    const before = createSeedState(NOW);
    const after = createTask(before, { title: "  Viết báo cáo  ", spaceId: "sp-retail" }, NOW);
    expect(after.tasks).toHaveLength(before.tasks.length + 1);
    expect(before.tasks).toHaveLength(createSeedState(NOW).tasks.length);
    expect(after.tasks.at(-1)).toMatchObject({ title: "Viết báo cáo", status: "TODO", spaceId: "sp-retail" });
    expect(after.activities.at(-1)?.type).toBe("task_created");
  });

  it("ignores blank task titles", () => {
    const state = createSeedState(NOW);
    expect(createTask(state, { title: "   ", spaceId: null }, NOW)).toBe(state);
  });

  it("forces a task into its project's space", () => {
    const state = createTask(createSeedState(NOW), { title: "X", spaceId: "sp-ielts", projectId: "pj-web" }, NOW);
    expect(state.tasks.at(-1)?.spaceId).toBe("sp-viewix");
  });

  it("logs completion and sets completedAt when a task is marked done", () => {
    const state = toggleTaskDone(createSeedState(NOW), "t-2", NOW);
    const task = state.tasks.find((t) => t.id === "t-2");
    expect(task?.status).toBe("DONE");
    expect(task?.completedAt).toBe(NOW.toISOString());
    expect(state.activities.filter((a) => a.entityId === "t-2").map((a) => a.type)).toEqual(["task_updated", "task_done"]);
  });

  it("clears completedAt when a done task is reopened", () => {
    const state = toggleTaskDone(createSeedState(NOW), "t-3", NOW);
    expect(state.tasks.find((t) => t.id === "t-3")).toMatchObject({ status: "TODO", completedAt: null });
  });

  it("records the message for each task change", () => {
    const state = updateTask(createSeedState(NOW), "t-1", { priority: "URGENT" }, "Đặt ưu tiên: Khẩn cấp", NOW);
    expect(state.activities.at(-1)).toMatchObject({ entityId: "t-1", message: "Đặt ưu tiên: Khẩn cấp" });
  });

  it("unlinks files from the old space when a task moves to another space's project", () => {
    let state = updateTask(createSeedState(NOW), "t-1", { linkedFileIds: ["f-1"] }, "Liên kết", NOW);
    expect(state.tasks.find((t) => t.id === "t-1")?.linkedFileIds).toEqual(["f-1"]);
    state = updateTask(state, "t-1", { projectId: "pj-sales" }, "Chuyển dự án", NOW);
    expect(state.tasks.find((t) => t.id === "t-1")).toMatchObject({ spaceId: "sp-retail", linkedFileIds: [] });
  });

  it("logs completion for a task created as done", () => {
    const state = createTask(createSeedState(NOW), { title: "Xong rồi", spaceId: "sp-retail", status: "DONE" }, NOW);
    expect(state.activities.slice(-2).map((a) => a.type)).toEqual(["task_created", "task_done"]);
  });

  it("rejects duplicate project names in the same space, case-insensitively", () => {
    const state = createSeedState(NOW);
    expect(createProject(state, "sp-viewix", "website REDESIGN", NOW)).toBe(state);
    expect(createProject(state, "sp-retail", "Website redesign", NOW).projects).toHaveLength(state.projects.length + 1);
  });

  it("detects Google file types from Drive URLs", () => {
    expect(kindFromDriveUrl("https://docs.google.com/spreadsheets/d/abc/edit")).toBe("sheet");
    expect(kindFromDriveUrl("https://docs.google.com/presentation/d/abc/edit")).toBe("slide");
    expect(kindFromDriveUrl("https://docs.google.com/document/d/abc/edit")).toBe("doc");
  });
});
