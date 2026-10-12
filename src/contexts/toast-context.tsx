"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  type: ToastType;
  title: string;
  description?: string;
}

interface ToastContextValue {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

const COLORS: Record<ToastType, string> = {
  success: "text-emerald-300",
  error: "text-rose-300",
  info: "text-sky-300",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (type: ToastType, title: string, description?: string) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev.slice(-3), { id, type, title, description }]);
      window.setTimeout(() => dismiss(id), 4800);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      success: (t, d) => push("success", t, d),
      error: (t, d) => push("error", t, d),
      info: (t, d) => push("info", t, d),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 top-4 z-[100] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-5 sm:top-5 sm:w-[380px]">
        <AnimatePresence>
          {toasts.map((toast) => {
            const Icon = ICONS[toast.type];
            return (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, y: -16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 24, transition: { duration: 0.18 } }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                className="pointer-events-auto w-full overflow-hidden rounded-2xl border border-white/10 bg-ink-800/95 shadow-2xl shadow-black/50 backdrop-blur-xl"
              >
                <div className="flex items-start gap-3 p-4">
                  <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", COLORS[toast.type])} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-zinc-100">{toast.title}</p>
                    {toast.description ? (
                      <p className="mt-0.5 break-words text-[13px] leading-snug text-zinc-400">{toast.description}</p>
                    ) : null}
                  </div>
                  <button
                    onClick={() => dismiss(toast.id)}
                    className="rounded-lg p-1 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-300"
                    aria-label="Dismiss"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
