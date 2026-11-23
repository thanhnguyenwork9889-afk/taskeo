import { z } from "zod";
import { DOC_KINDS, PRIORITIES, PROJECT_STATUSES, TASK_STATUSES } from "@/lib/labels";

// Schema dùng chung: kiểm tra dữ liệu đọc từ localStorage (chế độ demo)
// và sau này kiểm tra input của các API route.

const DRIVE_HOSTS = new Set(["drive.google.com", "docs.google.com"]);

/** true khi là liên kết HTTPS tới drive.google.com / docs.google.com (chặn javascript:, host giả...). */
export function isDriveUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && DRIVE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải có dạng YYYY-MM-DD");
const name = z.string().trim().min(1, "Tên không được để trống").max(200);

export const taskStatusSchema = z.enum(TASK_STATUSES);
export const prioritySchema = z.enum(PRIORITIES);
export const projectStatusSchema = z.enum(PROJECT_STATUSES);
export const docKindSchema = z.enum(DOC_KINDS);

export const spaceSchema = z.object({
  id: z.string(),
  name,
  description: z.string(),
  color: z.string(),
  tint: z.string(),
  driveFolderId: z.string().nullable(),
});

export const projectSchema = z.object({
  id: z.string(),
  spaceId: z.string(),
  name,
  description: z.string(),
  status: projectStatusSchema,
  dueDate: isoDate.nullable(),
});

export const taskSchema = z.object({
  id: z.string(),
  spaceId: z.string().nullable(),
  projectId: z.string().nullable(),
  title: name,
  description: z.string(),
  status: taskStatusSchema,
  priority: prioritySchema,
  dueDate: isoDate.nullable(),
  completedAt: z.string().nullable(),
  addToCalendar: z.boolean(),
  linkedFileIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const fileSchema = z.object({
  id: z.string(),
  name,
  kind: docKindSchema,
  spaceId: z.string(),
  projectId: z.string().nullable(),
  modifiedAt: z.string(),
  // Dữ liệu từ localStorage có thể bị sửa: chỉ giữ URL Drive hợp lệ.
  url: z.string().refine(isDriveUrl).nullable(),
});

export const activitySchema = z.object({
  id: z.string(),
  type: z.enum(["task_created", "task_done", "task_updated", "project_created", "doc_created"]),
  entityId: z.string().nullable(),
  message: z.string(),
  createdAt: z.string(),
});

export const workspaceStateSchema = z.object({
  version: z.literal(1),
  spaces: z.array(spaceSchema),
  projects: z.array(projectSchema),
  tasks: z.array(taskSchema),
  files: z.array(fileSchema),
  activities: z.array(activitySchema),
});

/** Chỉ chấp nhận liên kết HTTPS tới Google Drive / Docs. */
export const driveUrlSchema = z
  .string()
  .trim()
  .refine(isDriveUrl, "Nhập liên kết HTTPS hợp lệ từ drive.google.com hoặc docs.google.com.");
