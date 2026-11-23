interface ProgressBarProps {
  label: string;
  percent: number;
  color?: string;
}

export function ProgressBar({ label, percent, color = "var(--color-brand)" }: ProgressBarProps) {
  const value = Math.min(100, Math.max(0, Math.round(percent)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-1.5 rounded-full bg-[#EEE9F7]"
    >
      <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, background: color }} />
    </div>
  );
}

export function percentOf(done: number, total: number): number {
  return total ? Math.round((done / total) * 100) : 0;
}
