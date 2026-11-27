// Kiểu dữ liệu phía client. Giá trị enum trùng với prisma/schema.prisma để sau này
// đổi nguồn dữ liệu từ localStorage sang API mà không phải sửa giao diện.

import type { SPACE_ICONS } from "@/domain/labels";

export type TaskStatus = "TODO" | "IN_PROGRESS" | "PAUSED" | "DONE";
export type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type ProjectStatus = "ACTIVE" | "ON_HOLD" | "DONE" | "ARCHIVED";
export type DocKind = "doc" | "sheet" | "slide";
export type SpaceIcon = (typeof SPACE_ICONS)[number];
export type ActivityType = "task_created" | "task_done" | "task_updated" | "project_created" | "doc_created";

/** Ngày dạng YYYY-MM-DD (không có giờ, theo giờ địa phương). */
export type ISODate = string;

export interface Space {
  id: string;
  name: string;
  description: string;
  color: string;
  tint: string;
  icon: SpaceIcon;
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

/** File Google Docs / Sheets / Slides thật trên Drive, nằm trong thư mục không gian / dự án của user. */
export interface DriveFileItem {
  id: string;
  name: string;
  kind: DocKind;
  /** Liên kết mở file (lối tắt: mở file đích); `null` nếu không phải liên kết Drive HTTPS. */
  url: string | null;
  modifiedAt: string;
  spaceId: string;
  /** `null` khi file nằm thẳng trong thư mục không gian. */
  projectId: string | null;
  spaceName: string;
  projectName: string | null;
  /** `true` khi là lối tắt Drive do Taskeo tạo (file gắn qua Picker); `id` là id lối tắt, `url` mở file đích. */
  shortcut: boolean;
}

/** Phần `data` của `GET /api/files`. */
export interface ListFilesResponse {
  files: DriveFileItem[];
}

/** Phần `data` của `POST /api/files`. */
export interface CreateFileResponse {
  file: DriveFileItem;
}

/** Phần `data` của `POST /api/files/attach`. */
export interface AttachFileResponse {
  file: DriveFileItem;
}

/** Phần `data` của `GET /api/drive/picker-token`: access token ngắn hạn + cấu hình Google Picker. */
export interface PickerTokenResponse {
  accessToken: string;
  /** ISO 8601; `null` khi Google không báo hạn. */
  expiresAt: string | null;
  /** API key của Picker (`setDeveloperKey`). */
  developerKey: string;
  /** Project number Google Cloud (`setAppId`). */
  appId: string;
}

/** Dung lượng Google (byte) từ Drive `about.get` → `storageQuota`. `limit` null = không giới hạn. */
export interface DriveStorage {
  usage: number;
  limit: number | null;
  usageInDrive: number;
  usageInDriveTrash: number;
}

/** Phần `data` của `GET /api/drive/storage`. */
export interface DriveStorageResponse {
  storage: DriveStorage;
}
