import { cn } from "@/lib/utils";
import type { Network } from "@/lib/types";

const STYLES: Record<Network, { tile: string; text: string; ring: string; letter: string }> = {
  BEP20: {
    tile: "bg-amber-300/15 text-amber-300",
    text: "text-amber-200",
    ring: "ring-amber-300/25 bg-amber-400/[0.07]",
    letter: "B",
  },
  TRC20: {
    tile: "bg-rose-300/15 text-rose-300",
    text: "text-rose-200",
    ring: "ring-rose-300/25 bg-rose-400/[0.07]",
    letter: "T",
  },
};

export function NetworkBadge({ network, className }: { network: Network | null | undefined; className?: string }) {
  if (!network) return <span className="text-zinc-600">—</span>;
  const s = STYLES[network];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold ring-1 ring-inset", s.ring, s.text, className)}>
      <span className={cn("flex h-3.5 w-3.5 items-center justify-center rounded-[5px] text-[9px] font-black", s.tile)}>
        {s.letter}
      </span>
      {network}
    </span>
  );
}
