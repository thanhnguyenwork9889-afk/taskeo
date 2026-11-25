import {
  BookOpen,
  Briefcase,
  Code,
  FolderOpen,
  GraduationCap,
  Heart,
  House,
  Palette,
  ShoppingBag,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { SpaceIcon } from "@/domain/types";

/** Id icon không gian (domain) → component icon lucide. */
export const SPACE_ICON_COMPONENT: Record<SpaceIcon, LucideIcon> = {
  folder: FolderOpen,
  briefcase: Briefcase,
  book: BookOpen,
  graduation: GraduationCap,
  home: House,
  heart: Heart,
  code: Code,
  palette: Palette,
  shopping: ShoppingBag,
  wrench: Wrench,
};
