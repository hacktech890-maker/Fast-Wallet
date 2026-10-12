"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg" | "icon";

interface ButtonProps extends React.ComponentProps<"button"> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-gradient-to-b from-emerald-300 to-emerald-500 text-emerald-950 font-semibold shadow-[0_8px_28px_-8px_rgba(52,211,153,0.55)] hover:from-emerald-200 hover:to-emerald-400 hover:shadow-[0_10px_32px_-6px_rgba(52,211,153,0.6)] active:scale-[0.98]",
  secondary:
    "bg-white/[0.06] text-zinc-100 border border-white/10 hover:bg-white/[0.1] hover:border-white/20 active:scale-[0.98]",
  outline:
    "border border-emerald-400/40 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20 active:scale-[0.98]",
  ghost: "text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06]",
  danger:
    "bg-rose-500/15 text-rose-300 border border-rose-400/30 hover:bg-rose-500/25 active:scale-[0.98]",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-[15px] gap-2",
  icon: "h-9 w-9",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex select-none items-center justify-center rounded-xl tracking-tight transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:pointer-events-none disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
}
