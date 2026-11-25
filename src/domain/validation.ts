import { z } from "zod";
import {
  DEFAULT_SPACE_ICON,
  DOC_KINDS,
  PRIORITIES,
  PROJECT_STATUSES,
  SPACE_ICONS,
  SPACE_PALETTE,
  TASK_STATUSES,
} from "@/domain/labels";

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
/** Độ dài tối đa (ký tự, sau khi trim) của tên / mô tả không gian; UI dùng cho `maxLength`. */
export const SPACE_NAME_MAX = 200;
export const SPACE_DESCRIPTION_MAX = 500;
const name = z
  .string()
  .trim()
  .min(1, "Tên không được để trống")
  .max(SPACE_NAME_MAX, `Tên tối đa ${SPACE_NAME_MAX} ký tự`);

export const taskStatusSchema = z.enum(TASK_STATUSES);
export const prioritySchema = z.enum(PRIORITIES);
export const projectStatusSchema = z.enum(PROJECT_STATUSES);
export const docKindSchema = z.enum(DOC_KINDS);

const PALETTE_COLORS = new Set(SPACE_PALETTE.map((entry) => entry.color));

/** Màu không gian: chỉ nhận màu trong SPACE_PALETTE. */
export const spaceColorSchema = z.string().refine((value) => PALETTE_COLORS.has(value), "Màu không nằm trong bảng màu");
export const spaceIconSchema = z.enum(SPACE_ICONS, "Biểu tượng không hợp lệ");

export const spaceSchema = z.object({
  id: z.string(),
  name,
  description: z.string(),
  color: z.string(),
  tint: z.string(),
  // Dữ liệu localStorage cũ chưa có icon (hoặc icon lạ) vẫn đọc được, thay vì bị đưa về dữ liệu mẫu.
  icon: spaceIconSchema.catch(DEFAULT_SPACE_ICON),
  driveFolderId: z.string().nullable(),
});

// Input tạo / sửa không gian (API). `.strict()` chặn gán thừa userId, id, driveFolderId, order.
// Không dùng `.default()`: PATCH chỉ được chứa đúng các trường người dùng gửi lên.
const spaceInputFields = {
  name,
  description: z.string().trim().max(SPACE_DESCRIPTION_MAX, `Mô tả tối đa ${SPACE_DESCRIPTION_MAX} ký tự`).optional(),
  color: spaceColorSchema.optional(),
  icon: spaceIconSchema.optional(),
};

export const createSpaceInputSchema = z.strictObject(spaceInputFields);

export const updateSpaceInputSchema = z
  .strictObject({ ...spaceInputFields, name: name.optional() })
  .refine((input) => Object.keys(input).length > 0, "Cần gửi ít nhất một trường để cập nhật");

export type CreateSpaceInput = z.infer<typeof createSpaceInputSchema>;
export type UpdateSpaceInput = z.infer<typeof updateSpaceInputSchema>;

/** Độ dài tối đa (ký tự, sau khi trim) của tên / mô tả dự án; UI dùng cho `maxLength`. */
export const PROJECT_NAME_MAX = 200;
export const PROJECT_DESCRIPTION_MAX = 500;

/** true khi `YYYY-MM-DD` là ngày có thật (chặn 2026-02-31): đổi sang Date UTC rồi đổi ngược phải ra đúng chuỗi. */
function isRealIsoDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Hạn dự án ở input API: ngày `YYYY-MM-DD` có thật, hoặc `null` để xoá hạn. */
export const projectDueDateSchema = isoDate.refine(isRealIsoDate, "Ngày không hợp lệ").nullable();

const projectName = z
  .string()
  .trim()
  .min(1, "Tên không được để trống")
  .max(PROJECT_NAME_MAX, `Tên tối đa ${PROJECT_NAME_MAX} ký tự`);

// Input tạo / sửa dự án (API). Strict chặn spaceId, userId, id, order, driveFolderId; không `.default()`.
const projectInputFields = {
  name: projectName,
  description: z.string().trim().max(PROJECT_DESCRIPTION_MAX, `Mô tả tối đa ${PROJECT_DESCRIPTION_MAX} ký tự`).optional(),
  status: projectStatusSchema.optional(),
  dueDate: projectDueDateSchema.optional(),
};

export const createProjectInputSchema = z.strictObject(projectInputFields);

export const updateProjectInputSchema = z
  .strictObject({ ...projectInputFields, name: projectName.optional() })
  .refine((input) => Object.keys(input).length > 0, "Cần gửi ít nhất một trường để cập nhật");

export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>;

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
