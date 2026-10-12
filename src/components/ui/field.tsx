"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
  optional?: boolean;
}

export function Field({ label, error, hint, htmlFor, children, optional }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <label htmlFor={htmlFor} className="text-[13px] font-medium text-zinc-300">
          {label}
          {optional ? <span className="ml-1.5 text-[11px] font-normal text-zinc-500">optional</span> : null}
        </label>
      </div>
      {children}
      {error ? (
        <p className="text-[12.5px] font-medium text-rose-300">{error}</p>
      ) : hint ? (
        <p className="text-[12px] text-zinc-500">{hint}</p>
      ) : null}
    </div>
  );
}

interface TextInputProps extends React.ComponentProps<"input"> {
  invalid?: boolean;
  icon?: ReactNode;
}

export function TextInput({ className, invalid, icon, ...props }: TextInputProps) {
  return (
    <div className="relative">
      {icon ? (
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500">{icon}</span>
      ) : null}
      <input
        // Password managers / temp-mail extensions inject attributes into
        // inputs before hydration — this intentionally opts out of warning.
        suppressHydrationWarning
        className={cn(
          "h-11 w-full rounded-xl border bg-white/[0.04] px-3.5 text-[14.5px] text-zinc-100 placeholder:text-zinc-500 transition-colors focus:outline-none",
          icon ? "pl-10" : "",
          invalid
            ? "border-rose-400/50 focus:border-rose-300 focus:ring-2 focus:ring-rose-400/20"
            : "border-white/10 hover:border-white/20 focus:border-emerald-300/60 focus:ring-2 focus:ring-emerald-400/15",
          className,
        )}
        {...props}
      />
    </div>
  );
}

interface SelectInputProps extends React.ComponentProps<"select"> {
  invalid?: boolean;
}

export function SelectInput({ className, invalid, children, ...props }: SelectInputProps) {
  return (
    <select
      className={cn(
        "h-11 w-full appearance-none rounded-xl border bg-white/[0.04] px-3.5 text-[14.5px] text-zinc-100 transition-colors focus:outline-none [&>option]:bg-ink-800",
        invalid
          ? "border-rose-400/50 focus:border-rose-300"
          : "border-white/10 hover:border-white/20 focus:border-emerald-300/60",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
