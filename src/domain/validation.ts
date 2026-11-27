import { z } from "zod";
import {
  ACTIVITY_TYPES,
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
export const activityTypeSchema = z.enum(ACTIVITY_TYPES);

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

/** Khoảng năm nhận cho hạn dự án (Postgres không có năm 0; chặn ngày vô lý trước khi tới DB). */
export const PROJECT_DUE_YEAR_MIN = 1900;
export const PROJECT_DUE_YEAR_MAX = 2100;

function isDueYearInRange(value: string): boolean {
  const year = Number(value.slice(0, 4));
  return year >= PROJECT_DUE_YEAR_MIN && year <= PROJECT_DUE_YEAR_MAX;
}

/** Hạn dự án ở input API: ngày `YYYY-MM-DD` có thật, năm 1900–2100, hoặc `null` để xoá hạn. */
export const projectDueDateSchema = isoDate
  .refine((value) => isRealIsoDate(value) && isDueYearInRange(value), "Ngày không hợp lệ")
  .nullable();

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

/** Độ dài tối đa của id (cuid, id mẫu); `server/http.ts` dùng lại cho id trên URL. */
export const ID_MAX_LENGTH = 64;

/** Postgres không lưu / so được ký tự NUL trong cột text: chặn ở input thay vì để DB trả lỗi 500. */
export function hasNoNul(value: string): boolean {
  return !value.includes("\u0000");
}
const NUL_MESSAGE = "Không được chứa ký tự NUL";

/** Id thực thể trong body / query của API: chuỗi 1–ID_MAX_LENGTH ký tự, không có NUL. */
export const entityIdSchema = z.string().min(1).max(ID_MAX_LENGTH).refine(hasNoNul, NUL_MESSAGE);

/** Độ dài tối đa (ký tự, sau khi trim) của tiêu đề / mô tả công việc; UI dùng cho `maxLength`. */
export const TASK_TITLE_MAX = 200;
export const TASK_DESCRIPTION_MAX = 5000;

const taskTitle = z
  .string()
  .trim()
  .min(1, "Tiêu đề không được để trống")
  .max(TASK_TITLE_MAX, `Tiêu đề tối đa ${TASK_TITLE_MAX} ký tự`)
  .refine(hasNoNul, NUL_MESSAGE);

const taskDescription = z
  .string()
  .trim()
  .max(TASK_DESCRIPTION_MAX, `Mô tả tối đa ${TASK_DESCRIPTION_MAX} ký tự`)
  .refine(hasNoNul, NUL_MESSAGE);

// Input tạo / sửa công việc (API). Strict chặn userId, id, order, completedAt, calendarEventId,
// addToCalendar, createdAt, updatedAt; không `.default()`. PATCH không nhận spaceId (đi theo dự án).
const taskInputFields = {
  title: taskTitle,
  description: taskDescription.optional(),
  status: taskStatusSchema.optional(),
  priority: prioritySchema.optional(),
  dueDate: projectDueDateSchema.optional(),
  projectId: entityIdSchema.nullable().optional(),
};

export const createTaskInputSchema = z.strictObject({
  ...taskInputFields,
  spaceId: entityIdSchema.nullable().optional(),
});

export const updateTaskInputSchema = z
  .strictObject({ ...taskInputFields, title: taskTitle.optional() })
  .refine((input) => Object.keys(input).length > 0, "Cần gửi ít nhất một trường để cập nhật");

/** Chuỗi rỗng trong query (`?spaceId=`) coi như không gửi. */
function emptyToUndefined<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => (value === "" ? undefined : value), schema.optional());
}

/** Query lọc công việc. Không strict: key lạ (vd tham số chống cache) bị bỏ qua. */
export const listTasksQuerySchema = z.object({
  spaceId: emptyToUndefined(entityIdSchema),
  projectId: emptyToUndefined(entityIdSchema),
  status: emptyToUndefined(taskStatusSchema),
});

/** Danh sách key query mà `GET /api/tasks` đọc. */
export const LIST_TASKS_QUERY_KEYS = ["spaceId", "projectId", "status"] as const;

export type CreateTaskInput = z.infer<typeof createTaskInputSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskInputSchema>;
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;

/** Số hoạt động mặc định / tối đa mà `GET /api/activities` trả. */
export const ACTIVITY_LIST_DEFAULT = 50;
export const ACTIVITY_LIST_MAX = 200;

/**
 * `limit` trong query: chỉ gồm chữ số (không dùng `z.coerce`: nó nhận `1e2`, ` 5`, `0x10`),
 * số nguyên 1–`max`. Thiếu hoặc rỗng → `fallback`.
 */
function queryLimitSchema(max: number, fallback: number) {
  const message = `limit phải là số nguyên từ 1 đến ${max}`;
  return z
    .string()
    .optional()
    .transform((value) => (value === undefined || value === "" ? String(fallback) : value))
    .pipe(
      z
        .string()
        .regex(/^\d+$/, message)
        .transform(Number)
        .pipe(z.number().int().min(1, message).max(max, message)),
    );
}

/** Query đọc nhật ký hoạt động. Không strict: key lạ bị bỏ qua. */
export const listActivitiesQuerySchema = z.object({
  limit: queryLimitSchema(ACTIVITY_LIST_MAX, ACTIVITY_LIST_DEFAULT),
});

/** Danh sách key query mà `GET /api/activities` đọc. */
export const LIST_ACTIVITIES_QUERY_KEYS = ["limit"] as const;

export type ListActivitiesQuery = z.infer<typeof listActivitiesQuerySchema>;

/** Số file mặc định / tối đa mà `GET /api/files` trả. */
export const FILE_LIST_DEFAULT = 20;
export const FILE_LIST_MAX = 100;

/** Query liệt kê file Drive. Không strict: key lạ bị bỏ qua. `spaceId` và `projectId` không dùng cùng lúc. */
export const listFilesQuerySchema = z
  .object({
    spaceId: emptyToUndefined(entityIdSchema),
    projectId: emptyToUndefined(entityIdSchema),
    kind: emptyToUndefined(docKindSchema),
    limit: queryLimitSchema(FILE_LIST_MAX, FILE_LIST_DEFAULT),
  })
  .refine((query) => !(query.spaceId && query.projectId), {
    message: "Chỉ lọc theo spaceId hoặc projectId, không dùng cùng lúc",
    path: ["projectId"],
  });

/** Danh sách key query mà `GET /api/files` đọc. */
export const LIST_FILES_QUERY_KEYS = ["spaceId", "projectId", "kind", "limit"] as const;

export type ListFilesQuery = z.infer<typeof listFilesQuerySchema>;

// Input tạo file Google trống trong thư mục Drive (POST /api/files). Strict chặn driveFolderId, userId...;
// `projectId` rỗng (giá trị "không chọn dự án" của form) coi như không gửi.
export const createFileInputSchema = z.strictObject({
  name,
  kind: docKindSchema,
  spaceId: entityIdSchema,
  projectId: emptyToUndefined(entityIdSchema),
});

export type CreateFileInput = z.infer<typeof createFileInputSchema>;

export type QueryObjectResult = { ok: true; value: Record<string, string> } | { ok: false; key: string };

/**
 * Dựng object từ query string, chỉ lấy các key trong `keys` (key khác bỏ qua).
 * Không dùng `Object.fromEntries` vì nó nuốt giá trị lặp: key xuất hiện > 1 lần → `ok: false`.
 */
export function queryToObject(params: URLSearchParams, keys: readonly string[]): QueryObjectResult {
  const value: Record<string, string> = {};
  for (const key of keys) {
    const values = params.getAll(key);
    if (values.length > 1) return { ok: false, key };
    if (values.length === 1) value[key] = values[0];
  }
  return { ok: true, value };
}

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
  type: activityTypeSchema,
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
