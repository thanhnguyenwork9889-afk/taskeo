// Class Tailwind dùng lại nhiều nơi.

/** Vùng bấm tối thiểu 44px + vòng focus rõ ràng. */
export const control =
  "min-h-11 cursor-pointer rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

export const card = "min-w-0 rounded-xl border border-line bg-white";

export const field =
  "min-h-11 w-full min-w-0 rounded-lg border border-[#E6E3ED] bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand";

export const primaryButton = `${control} inline-flex items-center justify-center gap-2 bg-brand px-4 text-sm font-medium text-white hover:bg-brand-hover`;

export const secondaryButton = `${control} inline-flex items-center justify-center gap-2 border border-[#DDD7EA] bg-white px-4 text-sm font-medium text-[#65517F] hover:bg-brand-faint`;

/** Nút cho thao tác phá huỷ (xoá vĩnh viễn). */
export const dangerButton = `${control} inline-flex items-center justify-center gap-2 bg-red-700 px-4 text-sm font-medium text-white hover:bg-red-800`;

export const linkButton = `${control} inline-flex items-center gap-2 px-1 text-sm font-medium text-brand-ink`;

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
