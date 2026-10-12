"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/contexts/auth-context";
import { ToastProvider } from "@/contexts/toast-context";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <AuthProvider>{children}</AuthProvider>
    </ToastProvider>
  );
}
