"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaginationProps {
  page: number;
  limit: number;
  total: number;
  onPage: (page: number) => void;
  className?: string;
}

export function Pagination({ page, limit, total, onPage, className }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (total === 0) return null;

  const from = (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);

  const window: number[] = [];
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  for (let p = start; p <= Math.min(pages, start + 4); p++) window.push(p);

  return (
    <div className={cn("flex flex-col items-center justify-between gap-3 sm:flex-row", className)}>
      <p className="text-[12.5px] tabular-nums text-zinc-500">
        Showing <span className="text-zinc-300">{from}–{to}</span> of <span className="text-zinc-300">{total}</span>
      </p>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-zinc-400 transition hover:bg-white/5 hover:text-zinc-100 disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {window.map((p) => (
          <button
            key={p}
            onClick={() => onPage(p)}
            className={cn(
              "h-8 min-w-8 rounded-lg border px-2 text-[13px] tabular-nums transition",
              p === page
                ? "border-emerald-300/40 bg-emerald-400/15 text-emerald-200"
                : "border-white/10 text-zinc-400 hover:bg-white/5 hover:text-zinc-100",
            )}
          >
            {p}
          </button>
        ))}
        <button
          onClick={() => onPage(page + 1)}
          disabled={page >= pages}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-zinc-400 transition hover:bg-white/5 hover:text-zinc-100 disabled:opacity-40"
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
