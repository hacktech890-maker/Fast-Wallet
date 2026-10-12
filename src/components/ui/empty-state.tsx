import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 px-6 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.03]">
        <Icon className="h-6 w-6 text-zinc-500" strokeWidth={1.75} />
      </div>
      <p className="mt-1.5 font-display text-[15px] font-medium text-zinc-200">{title}</p>
      {description ? <p className="max-w-sm text-[13px] leading-relaxed text-zinc-500">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
