import { describe, expect, it } from "vitest";
import { createSeedState } from "./seed";
import {
  createProject,
  createSpace,
  createTask,
  deleteProject,
  deleteSpace,
  kindFromDriveUrl,
  projectDeletionImpact,
  projectNameExists,
  spaceDeletionImpact,
  toggleTaskDone,
  updateProject,
  updateSpace,
  updateTask,
} from "./workspace-actions";
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

describe("createSpace", () => {
  it("applies palette color, default icon and default description when only a name is given", () => {
    const before = createSeedState(NOW);
    const after = createSpace(before, { name: "  Gia đình  " });
    expect(after.spaces).toHaveLength(before.spaces.length + 1);
    expect(before.spaces).toHaveLength(createSeedState(NOW).spaces.length);
    // Seed có 4 không gian → màu thứ 5 của bảng màu.
    expect(after.spaces.at(-1)).toMatchObject({
      name: "Gia đình",
      description: "Không gian làm việc mới của bạn",
      color: "#D0708A",
      tint: "#FBEDF1",
      icon: "folder",
      driveFolderId: null,
    });
  });

  it("uses the chosen color, icon and description, deriving tint from the color", () => {
    const after = createSpace(createSeedState(NOW), {
      name: "Code",
      description: "  Dự án cá nhân  ",
      color: "#4C9C86",
      icon: "code",
    });
    expect(after.spaces.at(-1)).toMatchObject({
      name: "Code",
      description: "Dự án cá nhân",
      color: "#4C9C86",
      tint: "#E9F4EF",
      icon: "code",
    });
  });

  it("falls back to the default description when it is blank", () => {
    const after = createSpace(createSeedState(NOW), { name: "X", description: "   " });
    expect(after.spaces.at(-1)?.description).toBe("Không gian làm việc mới của bạn");
  });

  it("ignores blank names", () => {
    const state = createSeedState(NOW);
    expect(createSpace(state, { name: "" })).toBe(state);
    expect(createSpace(state, { name: "   " })).toBe(state);
  });
});

describe("updateSpace", () => {
  it("changes only the given fields without mutating the previous state", () => {
    const before = createSeedState(NOW);
    const original = before.spaces.find((s) => s.id === "sp-retail");
    const after = updateSpace(before, "sp-retail", { name: "  Bán lẻ  " });
    expect(after.spaces.find((s) => s.id === "sp-retail")).toEqual({ ...original, name: "Bán lẻ" });
    expect(before.spaces.find((s) => s.id === "sp-retail")).toEqual(createSeedState(NOW).spaces[1]);
    expect(after.spaces.find((s) => s.id === "sp-viewix")).toBe(before.spaces.find((s) => s.id === "sp-viewix"));
  });

  it("recomputes tint when the color changes and updates icon and description", () => {
    const after = updateSpace(createSeedState(NOW), "sp-retail", { color: "#D0708A", icon: "heart", description: "Mới" });
    expect(after.spaces.find((s) => s.id === "sp-retail")).toMatchObject({
      color: "#D0708A",
      tint: "#FBEDF1",
      icon: "heart",
      description: "Mới",
      name: "Smart Retail",
    });
  });

  it("ignores a blank name but still applies other changes", () => {
    const after = updateSpace(createSeedState(NOW), "sp-retail", { name: "   ", icon: "book" });
    expect(after.spaces.find((s) => s.id === "sp-retail")).toMatchObject({ name: "Smart Retail", icon: "book" });
  });

  it("returns the same state for an unknown id", () => {
    const state = createSeedState(NOW);
    expect(updateSpace(state, "sp-unknown", { name: "X" })).toBe(state);
  });
});

describe("deleteSpace", () => {
  const VIEWIX_PROJECTS = ["pj-web", "pj-brand", "pj-blog"];

  it("removes the space with its projects, tasks and files", () => {
    const before = createSeedState(NOW);
    const after = deleteSpace(before, "sp-viewix");
    const expectedTasks = before.tasks.filter((t) => t.spaceId !== "sp-viewix" && !VIEWIX_PROJECTS.includes(t.projectId ?? ""));

    expect(after.spaces.map((s) => s.id)).toEqual(["sp-retail", "sp-ielts", "sp-service"]);
    expect(after.projects.map((p) => p.id)).toEqual(["pj-sales", "pj-ielts", "pj-ops"]);
    expect(after.files.map((f) => f.id)).toEqual(["f-2"]);
    expect(after.tasks).toEqual(expectedTasks);
    expect(after.tasks.length).toBeLessThan(before.tasks.length);
    expect(after.activities).toBe(before.activities);
  });

  it("does not mutate the previous state and keeps other spaces untouched", () => {
    const before = createSeedState(NOW);
    const after = deleteSpace(before, "sp-viewix");
    expect(before).toEqual(createSeedState(NOW));
    expect(after.spaces[0]).toBe(before.spaces.find((s) => s.id === "sp-retail"));
  });

  it("removes tasks of the space that have no project", () => {
    const state = createTask(createSeedState(NOW), { title: "Lẻ", spaceId: "sp-viewix" }, NOW);
    const loose = state.tasks.at(-1);
    expect(deleteSpace(state, "sp-viewix").tasks.some((t) => t.id === loose?.id)).toBe(false);
  });

  it("unlinks deleted files from remaining tasks", () => {
    const seed = createSeedState(NOW);
    const state = {
      ...seed,
      tasks: seed.tasks.map((t) => (t.projectId === "pj-sales" ? { ...t, linkedFileIds: ["f-1", "f-2"] } : t)),
    };
    const after = deleteSpace(state, "sp-viewix");
    const salesTasks = after.tasks.filter((t) => t.projectId === "pj-sales");
    expect(salesTasks.length).toBeGreaterThan(0);
    for (const task of salesTasks) expect(task.linkedFileIds).toEqual(["f-2"]);
  });

  it("produces a state that still passes the storage schema", () => {
    expect(workspaceStateSchema.safeParse(deleteSpace(createSeedState(NOW), "sp-viewix")).success).toBe(true);
  });

  it("returns the same state for an unknown id", () => {
    const state = createSeedState(NOW);
    expect(deleteSpace(state, "sp-unknown")).toBe(state);
  });
});

describe("spaceDeletionImpact", () => {
  it("counts projects, tasks and files that would be deleted", () => {
    const state = createSeedState(NOW);
    const tasks = state.tasks.length - deleteSpace(state, "sp-viewix").tasks.length;
    expect(spaceDeletionImpact(state, "sp-viewix")).toEqual({ projects: 3, tasks, files: 5 });
    expect(tasks).toBeGreaterThan(0);
  });

  it("returns zeros for an unknown id", () => {
    expect(spaceDeletionImpact(createSeedState(NOW), "sp-unknown")).toEqual({ projects: 0, tasks: 0, files: 0 });
  });
});

describe("projectNameExists", () => {
  it("matches case-insensitively within the same space only", () => {
    const state = createSeedState(NOW);
    expect(projectNameExists(state, "sp-viewix", "  website REDESIGN ")).toBe(true);
    expect(projectNameExists(state, "sp-retail", "Website redesign")).toBe(false);
  });

  it("ignores the project with excludeId", () => {
    const state = createSeedState(NOW);
    expect(projectNameExists(state, "sp-viewix", "Website redesign", "pj-web")).toBe(false);
    expect(projectNameExists(state, "sp-viewix", "Website redesign", "pj-brand")).toBe(true);
  });
});

describe("updateProject", () => {
  it("renames with trimming without mutating the previous state", () => {
    const before = createSeedState(NOW);
    const original = before.projects.find((p) => p.id === "pj-web");
    const after = updateProject(before, "pj-web", { name: "  Website mới  " });
    expect(after.projects.find((p) => p.id === "pj-web")).toEqual({ ...original, name: "Website mới" });
    expect(before).toEqual(createSeedState(NOW));
    expect(after.projects.find((p) => p.id === "pj-brand")).toBe(before.projects.find((p) => p.id === "pj-brand"));
  });

  it("ignores a blank name but still applies other changes", () => {
    const after = updateProject(createSeedState(NOW), "pj-web", { name: "   ", description: "Mô tả mới" });
    expect(after.projects.find((p) => p.id === "pj-web")).toMatchObject({ name: "Website redesign", description: "Mô tả mới" });
  });

  it("returns the same state when the name duplicates another project in the space", () => {
    const state = createSeedState(NOW);
    expect(updateProject(state, "pj-web", { name: "brand IDENTITY", description: "X" })).toBe(state);
  });

  it("allows a name used by a project in another space", () => {
    const after = updateProject(createSeedState(NOW), "pj-web", { name: "Quản lý bán hàng" });
    expect(after.projects.find((p) => p.id === "pj-web")?.name).toBe("Quản lý bán hàng");
  });

  it("allows changing the case of its own name", () => {
    const after = updateProject(createSeedState(NOW), "pj-web", { name: "WEBSITE REDESIGN" });
    expect(after.projects.find((p) => p.id === "pj-web")?.name).toBe("WEBSITE REDESIGN");
  });

  it("still updates status and dueDate", () => {
    let state = updateProject(createSeedState(NOW), "pj-web", { status: "ON_HOLD" });
    state = updateProject(state, "pj-web", { dueDate: "2026-12-31" });
    expect(state.projects.find((p) => p.id === "pj-web")).toMatchObject({ status: "ON_HOLD", dueDate: "2026-12-31" });
    state = updateProject(state, "pj-web", { dueDate: null });
    expect(state.projects.find((p) => p.id === "pj-web")?.dueDate).toBeNull();
  });

  it("returns the same state for an unknown id", () => {
    const state = createSeedState(NOW);
    expect(updateProject(state, "pj-unknown", { name: "X" })).toBe(state);
  });
});

describe("deleteProject", () => {
  it("removes the project and keeps its tasks and files in the space with projectId null", () => {
    const before = createSeedState(NOW);
    const after = deleteProject(before, "pj-blog");
    expect(after.projects.map((p) => p.id)).not.toContain("pj-blog");
    expect(after.projects).toHaveLength(before.projects.length - 1);
    expect(after.tasks).toHaveLength(before.tasks.length);
    expect(after.files).toHaveLength(before.files.length);
    const blogTaskIds = before.tasks.filter((t) => t.projectId === "pj-blog").map((t) => t.id);
    for (const id of blogTaskIds) {
      expect(after.tasks.find((t) => t.id === id)).toMatchObject({ projectId: null, spaceId: "sp-viewix" });
    }
    for (const id of ["f-4", "f-5", "f-6"]) {
      expect(after.files.find((f) => f.id === id)).toMatchObject({ projectId: null, spaceId: "sp-viewix" });
    }
    expect(after.activities).toBe(before.activities);
  });

  it("does not mutate the previous state and leaves other projects, tasks and files untouched", () => {
    const before = createSeedState(NOW);
    const after = deleteProject(before, "pj-blog");
    expect(before).toEqual(createSeedState(NOW));
    expect(after.projects[0]).toBe(before.projects[0]);
    expect(after.tasks.find((t) => t.id === "t-1")).toBe(before.tasks.find((t) => t.id === "t-1"));
    expect(after.files.find((f) => f.id === "f-1")).toBe(before.files.find((f) => f.id === "f-1"));
  });

  it("moves a project task without a space into the project's space", () => {
    const seed = createSeedState(NOW);
    const state = { ...seed, tasks: seed.tasks.map((t) => (t.id === "t-1" ? { ...t, spaceId: null } : t)) };
    expect(deleteProject(state, "pj-web").tasks.find((t) => t.id === "t-1")).toMatchObject({ projectId: null, spaceId: "sp-viewix" });
  });

  it("produces a state that still passes the storage schema", () => {
    expect(workspaceStateSchema.safeParse(deleteProject(createSeedState(NOW), "pj-blog")).success).toBe(true);
  });

  it("returns the same state for an unknown id", () => {
    const state = createSeedState(NOW);
    expect(deleteProject(state, "pj-unknown")).toBe(state);
  });
});

describe("projectDeletionImpact", () => {
  it("counts tasks and files that move back to the space", () => {
    const state = createSeedState(NOW);
    expect(projectDeletionImpact(state, "pj-blog")).toEqual({ tasks: 6, files: 3 });
    expect(projectDeletionImpact(state, "pj-web")).toEqual({ tasks: 2, files: 1 });
  });

  it("returns zeros for an unknown id", () => {
    expect(projectDeletionImpact(createSeedState(NOW), "pj-unknown")).toEqual({ tasks: 0, files: 0 });
  });
});
