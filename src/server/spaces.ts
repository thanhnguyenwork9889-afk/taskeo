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

/** Số không gian tối đa của một người dùng: `createSpace` chặn ở đây, `listSpaces` cắt ở đây. */
export const MAX_SPACES = 200;

export type CreateSpaceResult = { ok: true; space: Space } | { ok: false; reason: "limit" };

type SpaceFieldsData = Partial<Pick<Space, "name" | "color" | "icon">> & { description?: string | null };

/** Mô tả rỗng (schema đã trim) lưu `null`, để DB chỉ có một kiểu "không có mô tả". */
function descriptionToDb(description: string | undefined): string | null {
  return description ? description : null;
}

/**
 * Chỉ giữ các trường cho phép sửa và có mặt trong input (không gửi `undefined`, bỏ khoá lạ).
 * `description: ""` → `null` để xoá mô tả.
 */
function pickSpaceFields(input: UpdateSpaceInput): SpaceFieldsData {
  const { name, description, color, icon } = input;
  return {
    ...(name !== undefined && { name }),
    ...(description !== undefined && { description: descriptionToDb(description) }),
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

/** Tạo không gian; đã đủ `MAX_SPACES` thì không tạo và trả `{ ok: false, reason: "limit" }`. */
export async function createSpace(userId: string, input: CreateSpaceInput): Promise<CreateSpaceResult> {
  // count rồi create không atomic: hai POST đồng thời có thể trùng `order` / màu mặc định
  // hoặc vượt MAX_SPACES một chút. Chấp nhận vì `order` chỉ dùng để sắp xếp.
  const count = await prisma.space.count({ where: { userId } });
  if (count >= MAX_SPACES) return { ok: false, reason: "limit" };
  const record = await prisma.space.create({
    data: {
      userId,
      name: input.name,
      // Thiếu hoặc rỗng → null; spaceFromRecord đổi null → "".
      description: descriptionToDb(input.description),
      color: input.color ?? SPACE_PALETTE[count % SPACE_PALETTE.length].color,
      icon: input.icon ?? DEFAULT_SPACE_ICON,
      order: count,
    },
    select: spaceSelect,
  });
  return { ok: true, space: spaceFromRecord(record) };
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
