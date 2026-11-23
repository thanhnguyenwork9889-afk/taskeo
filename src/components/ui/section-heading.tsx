import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { linkButton } from "@/components/ui/styles";

interface SectionHeadingProps {
  title: string;
  action?: string;
  href?: string;
  onAction?: () => void;
}

export function SectionHeading({ title, action, href, onAction }: SectionHeadingProps) {
  const content = (
    <>
      {action}
      <ArrowRight className="h-4 w-4" aria-hidden />
    </>
  );
  return (
    <div className="mb-5 flex items-center justify-between gap-3">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {action && href && (
        <Link href={href} className={linkButton}>
          {content}
        </Link>
      )}
      {action && !href && onAction && (
        <button type="button" onClick={onAction} className={linkButton}>
          {content}
        </button>
      )}
    </div>
  );
}
