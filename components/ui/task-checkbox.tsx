import { Check } from "lucide-react";
import { control, cx } from "@/lib/ui";

interface TaskCheckboxProps {
  title: string;
  done: boolean;
  onToggle: () => void;
}

export function TaskCheckbox({ title, done, onToggle }: TaskCheckboxProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={done}
      aria-label={done ? `Đánh dấu chưa xong: ${title}` : `Hoàn thành: ${title}`}
      className={cx(control, "flex w-11 shrink-0 items-center justify-center")}
    >
      <span
        className={cx(
          "flex h-[18px] w-[18px] items-center justify-center rounded border",
          done ? "border-brand bg-brand text-white" : "border-[#D8D4E3]",
        )}
      >
        {done && <Check className="h-3 w-3" aria-hidden />}
      </span>
    </button>
  );
}
