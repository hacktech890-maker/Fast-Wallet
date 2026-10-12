"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeftRight,
  ArrowUpFromLine,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  X,
  Zap,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/contexts/toast-context";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/withdrawals", label: "Withdrawals", icon: ArrowUpFromLine },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-300 to-teal-500 shadow-[0_6px_20px_-6px_rgba(52,211,153,0.7)]">
        <Zap className="h-4.5 w-4.5 text-emerald-950" strokeWidth={2.5} fill="currentColor" />
      </div>
      {!compact ? (
        <div className="leading-none">
          <p className="font-display text-[17px] font-bold tracking-tight text-zinc-50">
            Fast<span className="text-emerald-300"> Wallet</span>
          </p>
          <p className="mt-1 text-[9.5px] font-semibold uppercase tracking-[0.24em] text-zinc-500">Verified deposits</p>
        </div>
      ) : null}
    </div>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { isAdmin } = useAuth();
  const items = [...NAV_ITEMS, ...(isAdmin ? [{ href: "/admin", label: "Administration", icon: ShieldCheck } as const] : [])];

  return (
    <nav className="flex flex-col gap-1">
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[14px] font-medium transition-all duration-150",
              active ? "bg-white/[0.07] text-zinc-50" : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100",
            )}
          >
            {active ? (
              <motion.span
                layoutId="nav-indicator"
                className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.8)]"
                transition={{ type: "spring", stiffness: 500, damping: 34 }}
              />
            ) : null}
            <Icon className={cn("h-[18px] w-[18px]", active ? "text-emerald-300" : "text-zinc-500 group-hover:text-zinc-300")} strokeWidth={2} />
            {label}
            {label === "Administration" ? (
              <span className="ml-auto rounded-md bg-amber-400/15 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-amber-300 ring-1 ring-amber-300/25">
                Admin
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

function UserCard() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const toast = useToast();

  const handleLogout = async () => {
    await logout();
    toast.info("Signed out", "You have been securely signed out.");
    router.replace("/login");
  };

  if (!user) return null;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400/30 to-teal-500/30 text-[13px] font-bold text-emerald-200 ring-1 ring-emerald-300/25">
        {initials(user.firstName, user.lastName)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-semibold text-zinc-100">
          {user.firstName} {user.lastName}
        </p>
        <p className="truncate text-[11.5px] text-zinc-500">{user.email}</p>
      </div>
      <button
        onClick={handleLogout}
        className="rounded-lg p-2 text-zinc-500 transition hover:bg-rose-400/10 hover:text-rose-300"
        aria-label="Sign out"
        title="Sign out"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="relative min-h-dvh bg-ink-950 text-zinc-100">
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-40 left-1/4 h-[420px] w-[420px] rounded-full bg-emerald-500/[0.07] blur-[120px]" />
        <div className="absolute -bottom-40 right-0 h-[380px] w-[380px] rounded-full bg-teal-600/[0.06] blur-[120px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
      </div>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[264px] flex-col gap-6 border-r border-white/[0.06] bg-ink-900/70 px-4 py-6 backdrop-blur-xl lg:flex">
        <div className="px-2">
          <Logo />
        </div>
        <NavLinks />
        <div className="mt-1 rounded-2xl border border-emerald-300/15 bg-emerald-400/[0.05] p-3.5">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-300">Balance integrity</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-emerald-100/70">
            Funds credit only after verified payment confirmation. Every movement is ledgered and auditable.
          </p>
        </div>
        <div className="mt-auto">
          <UserCard />
        </div>
      </aside>

      <div className="relative lg:pl-[264px]">
        {/* Mobile topbar */}
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b border-white/[0.06] bg-ink-950/80 px-4 backdrop-blur-xl lg:hidden">
          <button
            onClick={() => setDrawerOpen(true)}
            className="rounded-xl border border-white/10 p-2 text-zinc-300 transition hover:bg-white/5"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Logo compact />
          <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-300/25">
            Secure
          </span>
        </header>

        {/* Mobile drawer */}
        <AnimatePresence>
          {drawerOpen ? (
            <motion.div className="fixed inset-0 z-[80] lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <button className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} aria-label="Close menu" />
              <motion.div
                initial={{ x: -300 }}
                animate={{ x: 0 }}
                exit={{ x: -300 }}
                transition={{ type: "spring", stiffness: 400, damping: 38 }}
                className="absolute inset-y-0 left-0 flex w-[280px] flex-col gap-6 border-r border-white/[0.08] bg-ink-900 px-4 py-6"
              >
                <div className="flex items-center justify-between px-2">
                  <Logo />
                  <button onClick={() => setDrawerOpen(false)} className="rounded-lg p-2 text-zinc-500 hover:bg-white/5 hover:text-zinc-200" aria-label="Close">
                    <X className="h-4.5 w-4.5" />
                  </button>
                </div>
                <NavLinks onNavigate={() => setDrawerOpen(false)} />
                <div className="mt-auto">
                  <UserCard />
                </div>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <main className="relative mx-auto w-full max-w-6xl px-4 pb-20 pt-8 sm:px-6 lg:px-10">{children}</main>
      </div>
    </div>
  );
}
