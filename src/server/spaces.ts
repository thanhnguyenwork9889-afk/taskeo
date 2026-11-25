import "server-only";
import { DEFAULT_SPACE_ICON, SPACE_PALETTE } from "@/domain/labels";
import { spaceFromRecord } from "@/domain/space-record";
import type { Space } from "@/domain/types";
import type { CreateSpaceInput, UpdateSpaceInput } from "@/domain/validation";
import { prisma } from "@/server/db";

// Chỉ đọc các cột `SpaceRecord` cần; không trả userId, order, createdAt.
const spaceSelect = {
  id: true,
  name: true,
  description: true,
  color: true,
  icon: true,
  driveFolderId: true,
} as const;

// Giới hạn an toàn cho danh sách không gian của một người dùng.
const MAX_SPACES = 200;

/** Chỉ giữ các trường cho phép sửa và có mặt trong input (không gửi `undefined`, bỏ khoá lạ). */
function pickSpaceFields(input: UpdateSpaceInput): Partial<Pick<Space, "name" | "description" | "color" | "icon">> {
  const { name, description, color, icon } = input;
  return {
    ...(name !== undefined && { name }),
    ...(description !== undefined && { description }),
    ...(color !== undefined && { color }),
    ...(icon !== undefined && { icon }),
  };
}

export async function listSpaces(userId: string): Promise<Space[]> {
  const records = await prisma.space.findMany({
    where: { userId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: spaceSelect,
    take: MAX_SPACES,
  });
  return records.map(spaceFromRecord);
}

export async function getSpace(userId: string, id: string): Promise<Space | null> {
  const record = await prisma.space.findFirst({ where: { id, userId }, select: spaceSelect });
  return record ? spaceFromRecord(record) : null;
}

export async function createSpace(userId: string, input: CreateSpaceInput): Promise<Space> {
  const count = await prisma.space.count({ where: { userId } });
  const record = await prisma.space.create({
    data: {
      userId,
      name: input.name,
      // Lưu null khi không có mô tả; spaceFromRecord đổi null → "".
      description: input.description ?? null,
      color: input.color ?? SPACE_PALETTE[count % SPACE_PALETTE.length].color,
      icon: input.icon ?? DEFAULT_SPACE_ICON,
      order: count,
    },
    select: spaceSelect,
  });
  return spaceFromRecord(record);
}

export async function updateSpace(userId: string, id: string, input: UpdateSpaceInput): Promise<Space | null> {
  const { count } = await prisma.space.updateMany({ where: { id, userId }, data: pickSpaceFields(input) });
  if (count === 0) return null;
  return getSpace(userId, id);
}

/** Xoá không gian của người dùng; project/task con bị xoá theo cascade trong schema. */
export async function deleteSpace(userId: string, id: string): Promise<boolean> {
  const { count } = await prisma.space.deleteMany({ where: { id, userId } });
  return count > 0;
}
