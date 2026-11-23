// Kiểu dữ liệu phía client. Giá trị enum trùng với prisma/schema.prisma để sau này
// đổi nguồn dữ liệu từ localStorage sang API mà không phải sửa giao diện.

export type TaskStatus = "TODO" | "IN_PROGRESS" | "PAUSED" | "DONE";
export type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type ProjectStatus = "ACTIVE" | "ON_HOLD" | "DONE" | "ARCHIVED";
export type DocKind = "doc" | "sheet" | "slide";
export type ActivityType = "task_created" | "task_done" | "task_updated" | "project_created" | "doc_created";

/** Ngày dạng YYYY-MM-DD (không có giờ, theo giờ địa phương). */
export type ISODate = string;

export interface Space {
  id: string;
  name: string;
  description: string;
  color: string;
  tint: string;
  driveFolderId: string | null;
}

export interface Project {
  id: string;
  spaceId: string;
  name: string;
  description: string;
  status: ProjectStatus;
  dueDate: ISODate | null;
}

export interface Task {
  id: string;
  spaceId: string | null;
  projectId: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  dueDate: ISODate | null;
  completedAt: string | null;
  addToCalendar: boolean;
  linkedFileIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceFile {
  id: string;
  name: string;
  kind: DocKind;
  spaceId: string;
  projectId: string | null;
  modifiedAt: string;
  /** Liên kết Google Drive (file gắn qua Picker hoặc tạo trên Drive). */
  url: string | null;
}

export interface Activity {
  id: string;
  type: ActivityType;
  entityId: string | null;
  message: string;
  createdAt: string;
}

export interface CalendarEvent {
  id: string;
  start: string;
  end: string;
  title: string;
  subtitle: string;
  color: string;
}

export interface WorkspaceState {
  version: 1;
  spaces: Space[];
  projects: Project[];
  tasks: Task[];
  files: WorkspaceFile[];
  activities: Activity[];
}
