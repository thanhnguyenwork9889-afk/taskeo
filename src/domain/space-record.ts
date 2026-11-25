import { DEFAULT_SPACE_ICON, SPACE_PALETTE, tintForColor } from "@/domain/labels";
import type { Space } from "@/domain/types";
import { spaceColorSchema, spaceIconSchema } from "@/domain/validation";

/** Bản ghi không gian từ DB (cấu trúc tương thích model `Space` của Prisma, không phụ thuộc Prisma). */
export interface SpaceRecord {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  driveFolderId: string | null;
}

/** Đổi bản ghi DB → `Space` phía client: giá trị null/lạ về mặc định, tính `tint`, bỏ các trường thừa. */
export function spaceFromRecord(record: SpaceRecord): Space {
  const colorResult = spaceColorSchema.safeParse(record.color);
  const color = colorResult.success ? colorResult.data : SPACE_PALETTE[0].color;
  const iconResult = spaceIconSchema.safeParse(record.icon);
  return {
    id: record.id,
    name: record.name,
    description: record.description ?? "",
    color,
    tint: tintForColor(color),
    icon: iconResult.success ? iconResult.data : DEFAULT_SPACE_ICON,
    driveFolderId: record.driveFolderId,
  };
}
