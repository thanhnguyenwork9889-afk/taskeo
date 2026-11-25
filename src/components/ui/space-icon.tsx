import { FolderOpen } from "lucide-react";
import type { SpaceIcon as SpaceIconId } from "@/domain/types";
import { SPACE_ICON_COMPONENT } from "@/components/ui/space-icons";
import { cx } from "@/components/ui/styles";

interface SpaceIconProps {
  icon: SpaceIconId;
  className?: string;
}

/** Icon của không gian; id lạ (dữ liệu cũ) rơi về FolderOpen. Chỉ trang trí nên aria-hidden. */
export function SpaceIcon({ icon, className }: SpaceIconProps) {
  const Icon = SPACE_ICON_COMPONENT[icon] ?? FolderOpen;
  return <Icon className={cx("h-4 w-4 shrink-0", className)} aria-hidden />;
}
