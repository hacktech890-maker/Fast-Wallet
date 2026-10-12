import { ArrowDownToLine, ArrowUpFromLine, Sparkles, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TxType } from "@/lib/types";

const CONFIG: Record<TxType, { icon: typeof ArrowDownToLine; className: string }> = {
  deposit: { icon: ArrowDownToLine, className: "bg-emerald-400/10 text-emerald-300 ring-emerald-300/20" },
  withdrawal: { icon: ArrowUpFromLine, className: "bg-rose-400/10 text-rose-300 ring-rose-300/20" },
  seed: { icon: Sparkles, className: "bg-violet-400/10 text-violet-300 ring-violet-300/20" },
  adjustment: { icon: SlidersHorizontal, className: "bg-sky-400/10 text-sky-300 ring-sky-300/20" },
  admin_credit: { icon: ArrowDownToLine, className: "bg-emerald-400/10 text-emerald-300 ring-emerald-300/20" },
  admin_debit: { icon: SlidersHorizontal, className: "bg-sky-400/10 text-sky-300 ring-sky-300/20" },
};

export function TxIcon({ type, className }: { type: TxType; className?: string }) {
  const { icon: Icon, className: tone } = CONFIG[type] ?? CONFIG.adjustment;
  return (
    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset", tone, className)}>
      <Icon className="h-4 w-4" strokeWidth={2.25} />
    </span>
  );
}

export const TX_TYPE_LABEL: Record<TxType, string> = {
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  seed: "Credit",
  adjustment: "Adjustment",
  admin_credit: "Deposit",
  admin_debit: "Adjustment",
};
