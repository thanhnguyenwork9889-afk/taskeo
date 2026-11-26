import { DEFAULT_SPACE_ICON, SPACE_PALETTE, STATUS_LABEL, tintForColor } from "@/domain/labels";
import { completedAtFor } from "@/domain/task-completion";
import type {
  Activity,
  ActivityType,
  DocKind,
  Project,
  Space,
  SpaceIcon,
  Task,
  TaskStatus,
  WorkspaceFile,
  WorkspaceState,
} from "@/domain/types";

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
    completedAt: completedAtFor("TODO", null, status, now.toISOString()),
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
  const completedAt = completedAtFor(current.status, current.completedAt, changes.status, now.toISOString());
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

const DEFAULT_SPACE_DESCRIPTION = "Không gian làm việc mới của bạn";

export interface NewSpaceInput {
  name: string;
  description?: string;
  color?: string;
  icon?: SpaceIcon;
}

export function createSpace(state: WorkspaceState, input: NewSpaceInput): WorkspaceState {
  const name = input.name.trim();
  if (!name) return state;
  const color = input.color ?? SPACE_PALETTE[state.spaces.length % SPACE_PALETTE.length].color;
  const space: Space = {
    id: newId("space"),
    name,
    description: input.description?.trim() || DEFAULT_SPACE_DESCRIPTION,
    color,
    tint: tintForColor(color),
    icon: input.icon ?? DEFAULT_SPACE_ICON,
    driveFolderId: null,
  };
  return { ...state, spaces: [...state.spaces, space] };
}

export type SpaceChanges = Partial<Pick<Space, "name" | "description" | "color" | "icon">>;

/** Chỉ đổi các trường được gửi; tên trống sau khi trim thì bỏ qua đổi tên. Đổi màu thì tính lại màu nền. */
export function updateSpace(state: WorkspaceState, id: string, changes: SpaceChanges): WorkspaceState {
  const current = state.spaces.find((s) => s.id === id);
  if (!current) return state;
  const name = changes.name?.trim() || current.name;
  const description = changes.description?.trim() ?? current.description;
  const color = changes.color ?? current.color;
  const tint = changes.color === undefined ? current.tint : tintForColor(color);
  const updated: Space = { ...current, name, description, color, tint, icon: changes.icon ?? current.icon };
  return { ...state, spaces: state.spaces.map((s) => (s.id === id ? updated : s)) };
}

interface SpaceContents {
  projectIds: Set<string>;
  tasks: Task[];
  files: WorkspaceFile[];
}

function spaceContents(state: WorkspaceState, id: string): SpaceContents {
  const projectIds = new Set(state.projects.filter((p) => p.spaceId === id).map((p) => p.id));
  const tasks = state.tasks.filter((t) => t.spaceId === id || (t.projectId !== null && projectIds.has(t.projectId)));
  const files = state.files.filter((f) => f.spaceId === id);
  return { projectIds, tasks, files };
}

export interface SpaceDeletionImpact {
  projects: number;
  tasks: number;
  files: number;
}

/** Số dự án / công việc / tài liệu sẽ mất khi xoá không gian. */
export function spaceDeletionImpact(state: WorkspaceState, id: string): SpaceDeletionImpact {
  const { projectIds, tasks, files } = spaceContents(state, id);
  return { projects: projectIds.size, tasks: tasks.length, files: files.length };
}

/** Xoá không gian cùng dự án, công việc, tài liệu của nó (khớp onDelete: Cascade). Giữ nguyên hoạt động. */
export function deleteSpace(state: WorkspaceState, id: string): WorkspaceState {
  if (!state.spaces.some((s) => s.id === id)) return state;
  const { projectIds, tasks, files } = spaceContents(state, id);
  const removedTaskIds = new Set(tasks.map((t) => t.id));
  const removedFileIds = new Set(files.map((f) => f.id));
  const unlink = (task: Task): Task =>
    task.linkedFileIds.some((fileId) => removedFileIds.has(fileId))
      ? { ...task, linkedFileIds: task.linkedFileIds.filter((fileId) => !removedFileIds.has(fileId)) }
      : task;
  return {
    ...state,
    spaces: state.spaces.filter((s) => s.id !== id),
    projects: state.projects.filter((p) => !projectIds.has(p.id)),
    tasks: state.tasks.filter((t) => !removedTaskIds.has(t.id)).map(unlink),
    files: state.files.filter((f) => !removedFileIds.has(f.id)),
  };
}

/** Tên dự án đã có trong không gian chưa (không phân biệt hoa thường); bỏ qua dự án `excludeId`. */
export function projectNameExists(state: WorkspaceState, spaceId: string, name: string, excludeId?: string): boolean {
  const target = name.trim().toLocaleLowerCase("vi");
  return state.projects.some(
    (p) => p.id !== excludeId && p.spaceId === spaceId && p.name.toLocaleLowerCase("vi") === target,
  );
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

export type ProjectChanges = Partial<Pick<Project, "name" | "status" | "dueDate" | "description">>;

/**
 * Chỉ đổi các trường được gửi. Tên được trim; trống thì bỏ qua đổi tên;
 * trùng với dự án khác cùng không gian thì không đổi gì (trả lại state cũ).
 */
export function updateProject(state: WorkspaceState, id: string, changes: ProjectChanges): WorkspaceState {
  const current = state.projects.find((p) => p.id === id);
  if (!current) return state;
  const name = changes.name?.trim() || current.name;
  if (name !== current.name && projectNameExists(state, current.spaceId, name, id)) return state;
  // Chọn rõ từng trường: giữ kiểu, bỏ khoá `undefined` và khoá lạ (id, spaceId…).
  const { description, status, dueDate } = changes;
  const updated: Project = {
    ...current,
    name,
    ...(description !== undefined && { description }),
    ...(status !== undefined && { status }),
    ...(dueDate !== undefined && { dueDate }),
  };
  return { ...state, projects: state.projects.map((p) => (p.id === id ? updated : p)) };
}

export interface ProjectDeletionImpact {
  tasks: number;
  files: number;
}

/** Số công việc / tài liệu sẽ chuyển về không gian khi xoá dự án. */
export function projectDeletionImpact(state: WorkspaceState, id: string): ProjectDeletionImpact {
  return {
    tasks: state.tasks.filter((t) => t.projectId === id).length,
    files: state.files.filter((f) => f.projectId === id).length,
  };
}

/** Xoá dự án; công việc và tài liệu của nó ở lại không gian với projectId = null (khớp onDelete: SetNull). */
export function deleteProject(state: WorkspaceState, id: string): WorkspaceState {
  const project = state.projects.find((p) => p.id === id);
  if (!project) return state;
  return {
    ...state,
    projects: state.projects.filter((p) => p.id !== id),
    tasks: state.tasks.map((t) =>
      t.projectId === id ? { ...t, projectId: null, spaceId: t.spaceId ?? project.spaceId } : t,
    ),
    files: state.files.map((f) => (f.projectId === id ? { ...f, projectId: null } : f)),
  };
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
