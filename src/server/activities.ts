import "server-only";
import { activityFromRecord } from "@/domain/activity-record";
import type { Activity } from "@/domain/types";
import { prisma } from "@/server/db";

// Chỉ đọc các cột `ActivityRecord` cần; không trả userId.
const activitySelect = {
  id: true,
  type: true,
  entityId: true,
  meta: true,
  createdAt: true,
} as const;

/**
 * Hoạt động gần nhất của người dùng, mới nhất trước (`id` phá hoà khi trùng `createdAt`).
 * Bản ghi có `type` lạ bị loại sau khi đọc, nên có thể trả ít hơn `limit`.
 */
export async function listActivities(userId: string, limit: number): Promise<Activity[]> {
  const records = await prisma.activity.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    select: activitySelect,
  });
  return records.map(activityFromRecord).filter((item): item is Activity => item !== null);
}
