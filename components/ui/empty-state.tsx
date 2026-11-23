import { Plus, type LucideIcon } from "lucide-react";
import { card, cx, primaryButton } from "@/lib/ui";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <section className={cx(card, "flex flex-col items-center px-6 py-10 text-center")}>
      <div aria-hidden className="relative mb-6 flex h-24 w-28 items-center justify-center">
        <span className="absolute h-24 w-24 rounded-full bg-[#F1ECFB]" />
        <span className="-rotate-6 rounded-2xl border border-[#DDD2EF] bg-white p-4 text-[#8B71C2]">
          <Icon className="h-9 w-9" />
        </span>
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mb-6 mt-3 max-w-xs text-sm leading-6 text-muted">{description}</p>
      {actionLabel && onAction && (
        <button type="button" onClick={onAction} className={primaryButton}>
          <Plus className="h-4 w-4" aria-hidden />
          {actionLabel}
        </button>
      )}
    </section>
  );
}
