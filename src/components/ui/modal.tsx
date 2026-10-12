"use client";

import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  wide?: boolean;
  dismissible?: boolean;
}

export function Modal({ open, onClose, title, subtitle, children, wide, dismissible = true }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissible) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose, dismissible]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[90] flex items-end justify-center p-0 sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            aria-label="Close dialog"
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
            onClick={() => dismissible && onClose()}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, y: 32, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98, transition: { duration: 0.15 } }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            className={cn(
              "relative max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border border-white/10 bg-ink-850/95 shadow-2xl shadow-black/60 backdrop-blur-2xl sm:rounded-3xl",
              wide ? "max-w-2xl" : "max-w-md",
            )}
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 rounded-t-3xl border-b border-white/[0.06] bg-ink-850/95 px-6 pb-4 pt-5 backdrop-blur-xl">
              <div>
                {title ? <h2 className="font-display text-lg font-semibold tracking-tight text-zinc-50">{title}</h2> : null}
                {subtitle ? <p className="mt-0.5 text-[13px] text-zinc-400">{subtitle}</p> : null}
              </div>
              {dismissible ? (
                <button
                  onClick={onClose}
                  className="rounded-xl p-2 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200"
                  aria-label="Close"
                >
                  <X className="h-4.5 w-4.5" />
                </button>
              ) : null}
            </div>
            <div className="px-6 py-5">{children}</div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
