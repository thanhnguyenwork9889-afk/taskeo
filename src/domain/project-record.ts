import type { ISODate, Project } from "@/domain/types";
import { projectStatusSchema } from "@/domain/validation";

/** Bản ghi dự án từ DB (cấu trúc tương thích model `Project` của Prisma, không phụ thuộc Prisma). */
export interface ProjectRecord {
  id: string;
  spaceId: string;
  name: string;
  description: string | null;
  status: string;
  dueDate: Date | null;
}

/** `YYYY-MM-DD` → nửa đêm UTC của ngày đó; không phụ thuộc múi giờ máy chủ. */
export function dueDateToDb(dueDate: ISODate | null): Date | null {
  return dueDate === null ? null : new Date(`${dueDate}T00:00:00.000Z`);
}

/** Date từ DB → `YYYY-MM-DD` theo UTC; không phụ thuộc múi giờ máy chủ. */
export function dueDateFromDb(dueDate: Date | null): ISODate | null {
  return dueDate === null ? null : dueDate.toISOString().slice(0, 10);
}

/** Đổi bản ghi DB → `Project` phía client: mô tả null → "", status lạ → ACTIVE, bỏ các trường thừa. */
export function projectFromRecord(record: ProjectRecord): Project {
  const statusResult = projectStatusSchema.safeParse(record.status);
  return {
    id: record.id,
    spaceId: record.spaceId,
    name: record.name,
    description: record.description ?? "",
    status: statusResult.success ? statusResult.data : "ACTIVE",
    dueDate: dueDateFromDb(record.dueDate),
  };
}
