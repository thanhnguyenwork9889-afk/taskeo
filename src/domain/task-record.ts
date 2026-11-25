import { dueDateFromDb } from "@/domain/project-record";
import type { Task } from "@/domain/types";
import { prioritySchema, taskStatusSchema } from "@/domain/validation";

/** Bản ghi công việc từ DB (cấu trúc tương thích model `Task` của Prisma, không phụ thuộc Prisma). */
export interface TaskRecord {
  id: string;
  spaceId: string | null;
  projectId: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: Date | null;
  completedAt: Date | null;
  calendarEventId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Đổi bản ghi DB → `Task` phía client: mô tả null → "", status / priority lạ → TODO / MEDIUM,
 * hạn theo UTC, mốc thời gian dạng ISO, `addToCalendar` theo `calendarEventId`, bỏ các trường thừa.
 */
export function taskFromRecord(record: TaskRecord): Task {
  const statusResult = taskStatusSchema.safeParse(record.status);
  const priorityResult = prioritySchema.safeParse(record.priority);
  return {
    id: record.id,
    spaceId: record.spaceId,
    projectId: record.projectId,
    title: record.title,
    description: record.description ?? "",
    status: statusResult.success ? statusResult.data : "TODO",
    priority: priorityResult.success ? priorityResult.data : "MEDIUM",
    dueDate: dueDateFromDb(record.dueDate),
    completedAt: record.completedAt === null ? null : record.completedAt.toISOString(),
    addToCalendar: record.calendarEventId !== null,
    linkedFileIds: [],
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
