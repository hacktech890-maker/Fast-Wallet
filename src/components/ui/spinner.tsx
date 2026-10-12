import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-5 w-5 animate-spin text-emerald-300", className)} />;
}

export function PageLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3">
      <div className="relative">
        <div className="h-12 w-12 rounded-full border-2 border-emerald-300/20 border-t-emerald-300 animate-spin" />
        <div className="absolute inset-0 m-auto h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_16px_rgba(52,211,153,0.9)]" />
      </div>
      <p className="text-[12.5px] font-medium uppercase tracking-[0.2em] text-zinc-500">{label}</p>
    </div>
  );
}
