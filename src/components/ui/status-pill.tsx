import { cn } from "@/lib/utils";
import type { RequestStatus, TxStatus } from "@/lib/types";

type AnyStatus = RequestStatus | TxStatus;

const STYLES: Record<AnyStatus, { dot: string; text: string; bg: string; ring: string; pulse?: boolean }> = {
  pending: { dot: "bg-amber-300", text: "text-amber-200", bg: "bg-amber-400/10", ring: "ring-amber-300/25", pulse: true },
  approved: { dot: "bg-emerald-300", text: "text-emerald-200", bg: "bg-emerald-400/10", ring: "ring-emerald-300/25" },
  completed: { dot: "bg-emerald-300", text: "text-emerald-200", bg: "bg-emerald-400/10", ring: "ring-emerald-300/25" },
  rejected: { dot: "bg-rose-300", text: "text-rose-200", bg: "bg-rose-400/10", ring: "ring-rose-300/25" },
  cancelled: { dot: "bg-zinc-400", text: "text-zinc-300", bg: "bg-zinc-400/10", ring: "ring-zinc-400/25" },
};

const LABELS: Record<AnyStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  completed: "Completed",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export function StatusPill({ status, className }: { status: AnyStatus; className?: string }) {
  const s = STYLES[status] ?? STYLES.cancelled;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium ring-1 ring-inset",
        s.bg,
        s.text,
        s.ring,
        className,
      )}
    >
      <span className="relative flex h-1.5 w-1.5">
        {s.pulse ? <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", s.dot)} /> : null}
        <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", s.dot)} />
      </span>
      {LABELS[status] ?? status}
    </span>
  );
}
