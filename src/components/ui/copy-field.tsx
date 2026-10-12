"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

interface CopyFieldProps {
  value: string;
  display?: string;
  className?: string;
  mono?: boolean;
}

export function CopyField({ value, display, className, mono = true }: CopyFieldProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Fallback for non-secure contexts
      const ta = document.createElement("textarea");
      ta.value = value;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        "group flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 text-left transition hover:border-emerald-300/30 hover:bg-white/[0.05]",
        className,
      )}
    >
      <span className={cn("min-w-0 break-all text-[13px] text-zinc-300", mono && "font-mono tracking-tight")}>
        {display ?? value}
      </span>
      <span className="shrink-0 text-zinc-500 transition group-hover:text-emerald-300">
        {copied ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />}
      </span>
    </button>
  );
}
