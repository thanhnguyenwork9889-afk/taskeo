import { SPACE_PALETTE, STATUS_LABEL } from "@/lib/labels";
import type { Activity, ActivityType, DocKind, Project, Task, TaskStatus, WorkspaceFile, WorkspaceState } from "@/lib/types";

// Các hàm thuần (không side effect): nhận state cũ, trả state mới, không sửa state cũ.
// `now` được truyền vào để dễ test.

const newId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

function activity(type: ActivityType, entityId: string | null, message: string, now: Date): Activity {
  return { id: newId("act"), type, entityId, message, createdAt: now.toISOString() };
}

export interface NewTaskInput {
  title: string;
  spaceId: string | null;
  projectId?: string | null;
  status?: TaskStatus;
  dueDate?: string | null;
}

export function createTask(state: WorkspaceState, input: NewTaskInput, now: Date): WorkspaceState {
  const title = input.title.trim();
  if (!title) return state;
  // Công việc thuộc dự án thì luôn nằm cùng không gian với dự án đó.
  const project = input.projectId ? state.projects.find((p) => p.id === input.projectId) : undefined;
  const status = input.status ?? "TODO";
  const task: Task = {
    id: newId("task"),
    title,
    spaceId: project?.spaceId ?? input.spaceId,
    projectId: project?.id ?? null,
    description: "",
    status,
    priority: "MEDIUM",
    dueDate: input.dueDate ?? null,
    completedAt: status === "DONE" ? now.toISOString() : null,
    addToCalendar: false,
    linkedFileIds: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  const log = [activity("task_created", task.id, "Tạo công việc", now)];
  if (status === "DONE") log.push(activity("task_done", task.id, "Hoàn thành công việc", now));
  return {
    ...state,
    tasks: [...state.tasks, task],
    activities: [...state.activities, ...log],
  };
}

// Không cho đổi spaceId trực tiếp: không gian luôn đi theo dự án.
export type TaskChanges = Partial<
  Pick<Task, "title" | "description" | "status" | "priority" | "dueDate" | "addToCalendar" | "linkedFileIds" | "projectId">
>;

export function updateTask(state: WorkspaceState, id: string, changes: TaskChanges, message: string, now: Date): WorkspaceState {
  const current = state.tasks.find((t) => t.id === id);
  if (!current) return state;

  const statusChanged = changes.status !== undefined && changes.status !== current.status;
  const completedAt = !statusChanged ? current.completedAt : changes.status === "DONE" ? now.toISOString() : null;
  const project = changes.projectId ? state.projects.find((p) => p.id === changes.projectId) : undefined;
  const spaceId = project?.spaceId ?? current.spaceId;
  // Đổi sang không gian khác thì bỏ các file thuộc không gian cũ.
  const linkedFileIds = (changes.linkedFileIds ?? current.linkedFileIds).filter(
    (fileId) => state.files.find((f) => f.id === fileId)?.spaceId === spaceId,
  );
  const updated: Task = { ...current, ...changes, spaceId, linkedFileIds, completedAt, updatedAt: now.toISOString() };

  const log = [activity("task_updated", id, message, now)];
  if (statusChanged && changes.status === "DONE") log.push(activity("task_done", id, "Hoàn thành công việc", now));

  return {
    ...state,
    tasks: state.tasks.map((t) => (t.id === id ? updated : t)),
    activities: [...state.activities, ...log],
  };
}

export function setTaskStatus(state: WorkspaceState, id: string, status: TaskStatus, now: Date): WorkspaceState {
  return updateTask(state, id, { status }, `Chuyển sang ${STATUS_LABEL[status].toLowerCase()}`, now);
}

export function toggleTaskDone(state: WorkspaceState, id: string, now: Date): WorkspaceState {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return state;
  return setTaskStatus(state, id, task.status === "DONE" ? "TODO" : "DONE", now);
}

export function createSpace(state: WorkspaceState, name: string): WorkspaceState {
  const trimmed = name.trim();
  if (!trimmed) return state;
  const palette = SPACE_PALETTE[state.spaces.length % SPACE_PALETTE.length];
  return {
    ...state,
    spaces: [
      ...state.spaces,
      { id: newId("space"), name: trimmed, description: "Không gian làm việc mới của bạn", driveFolderId: null, ...palette },
    ],
  };
}

export function projectNameExists(state: WorkspaceState, spaceId: string, name: string): boolean {
  const target = name.trim().toLocaleLowerCase("vi");
  return state.projects.some((p) => p.spaceId === spaceId && p.name.toLocaleLowerCase("vi") === target);
}

export function createProject(state: WorkspaceState, spaceId: string, name: string, now: Date): WorkspaceState {
  const trimmed = name.trim();
  if (!trimmed || projectNameExists(state, spaceId, trimmed)) return state;
  const project: Project = {
    id: newId("project"),
    spaceId,
    name: trimmed,
    description: "Dự án mới của bạn. Bắt đầu với công việc đầu tiên.",
    status: "ACTIVE",
    dueDate: null,
  };
  return {
    ...state,
    projects: [...state.projects, project],
    activities: [...state.activities, activity("project_created", project.id, "Tạo dự án", now)],
  };
}

export function updateProject(
  state: WorkspaceState,
  id: string,
  changes: Partial<Pick<Project, "status" | "dueDate" | "description">>,
): WorkspaceState {
  return { ...state, projects: state.projects.map((p) => (p.id === id ? { ...p, ...changes } : p)) };
}

export interface NewFileInput {
  name: string;
  kind: DocKind;
  spaceId: string;
  projectId: string | null;
  url?: string | null;
}

export function createFile(state: WorkspaceState, input: NewFileInput, now: Date): WorkspaceState {
  const name = input.name.trim();
  if (!name) return state;
  const file: WorkspaceFile = {
    id: newId("file"),
    name,
    kind: input.kind,
    spaceId: input.spaceId,
    projectId: input.projectId,
    modifiedAt: now.toISOString(),
    url: input.url ?? null,
  };
  return {
    ...state,
    files: [...state.files, file],
    activities: [...state.activities, activity("doc_created", file.id, "Tạo tài liệu", now)],
  };
}

/** Đoán loại file từ đường dẫn Google Docs / Sheets / Slides. */
export function kindFromDriveUrl(url: string): DocKind {
  const path = new URL(url).pathname;
  if (path.includes("/spreadsheets/")) return "sheet";
  if (path.includes("/presentation/")) return "slide";
  return "doc";
}
