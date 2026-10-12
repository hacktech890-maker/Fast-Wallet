"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { PageLoader } from "@/components/ui/spinner";
import { useAuth } from "@/contexts/auth-context";

/**
 * Client-side guard for authenticated areas. The server independently
 * re-verifies every API call — this only shapes navigation UX.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [loading, user, router, pathname]);

  if (loading || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-ink-950">
        <PageLoader label="Fast Wallet" />
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
