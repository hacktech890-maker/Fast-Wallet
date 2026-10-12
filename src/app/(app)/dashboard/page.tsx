"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowRight,
  Landmark,
  Puzzle,
  RefreshCw,
  Hourglass,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { EmptyState } from "@/components/ui/empty-state";
import { TxIcon, TX_TYPE_LABEL } from "@/components/ui/tx-icon";
import { NetworkBadge } from "@/components/ui/network-badge";
import { DepositModal } from "@/components/wallet/deposit-modal";
import { SendModal } from "@/components/wallet/send-modal";
import { ActivityChart, type ActivityPoint } from "@/components/charts/activity-chart";
import { walletApi } from "@/lib/api/wallet.api";
import { transactionsApi } from "@/lib/api/transactions.api";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/contexts/toast-context";
import { useCountUp } from "@/hooks/use-count-up";
import { formatAmount, formatDateTime, greeting, isDebit } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Transaction, WalletSummary } from "@/lib/types";

function buildActivity(items: Transaction[]): (ActivityPoint & { key: string })[] {
  const days: (ActivityPoint & { key: string })[] = [];
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    days.push({
      date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      key: d.toDateString(),
      inflow: 0,
      outflow: 0,
    });
  }
  for (const t of items) {
    const key = new Date(t.createdAt).toDateString();
    const day = days.find((d) => d.key === key);
    if (!day) continue;
    const amt = Number(t.amount);
    if (amt >= 0) day.inflow += amt;
    else day.outflow += Math.abs(amt);
  }
  return days;
}

function AnimatedBalance({ value }: { value: number }) {
  const animated = useCountUp(value);
  return (
    <span className="font-display text-[44px] font-bold tabular-nums leading-none tracking-tight sm:text-[56px]">
      {formatAmount(animated.toFixed(2))}
    </span>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof Landmark;
  label: string;
  value: string;
  sub: string;
  tone: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-ink-850/60 p-5 backdrop-blur-sm transition-colors hover:border-white/[0.12]">
      <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl ring-1 ring-inset", tone)}>
        <Icon className="h-4 w-4" strokeWidth={2.25} />
      </div>
      <p className="mt-4 text-[12px] font-medium uppercase tracking-[0.14em] text-zinc-500">{label}</p>
      <p className="mt-1.5 font-display text-[22px] font-bold tabular-nums tracking-tight text-zinc-50">{value}</p>
      <p className="mt-0.5 text-[12px] text-zinc-500">{sub}</p>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [activity, setActivity] = useState<ActivityPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    try {
      const [s, tx] = await Promise.all([
        walletApi.summary(),
        transactionsApi.list({ limit: 50, sort: "date", order: "desc" }),
      ]);
      setSummary(s);
      setActivity(buildActivity(tx.items));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load wallet");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Handle the user returning from the hosted checkout page. The return URL
  // NEVER credits anything — it only triggers refresh polling while the
  // verified webhook settles the deposit server-side.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("deposit");
    if (!outcome) return;
    window.history.replaceState({}, "", "/dashboard");
    if (outcome === "success") {
      toast.info("Payment received", "Your balance will update the moment the payment is confirmed — usually seconds.");
      const timers = [1500, 4000, 8000].map((ms) => window.setTimeout(() => void load(true), ms));
      return () => timers.forEach((t) => window.clearTimeout(t));
    }
    if (outcome === "cancelled") {
      toast.info("Checkout cancelled", "No charge was made and your balance is unchanged.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pendingCount = useMemo(
    () => (summary ? summary.stats.pendingDeposits.count + summary.stats.pendingWithdrawals.count : 0),
    [summary],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
            {greeting()}{user ? `, ${user.firstName}` : ""}
          </p>
          <h1 className="mt-1.5 font-display text-[28px] font-bold tracking-tight sm:text-[32px]">Wallet overview</h1>
        </div>
        <div className="flex items-center gap-2.5">
          <Button variant="ghost" size="icon" onClick={() => void load(true)} aria-label="Refresh" title="Refresh">
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          </Button>
          <Button variant="secondary" onClick={() => setSendOpen(true)}>
            <ArrowUpFromLine className="h-4 w-4 text-rose-300" />
            Send
          </Button>
          <Button onClick={() => setDepositOpen(true)}>
            <ArrowDownToLine className="h-4 w-4" />
            Receive
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-400/25 bg-rose-400/[0.07] p-6 text-center">
          <p className="text-[14px] font-medium text-rose-200">{error}</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      ) : !summary ? (
        <div className="space-y-4">
          <Skeleton className="h-56" />
          <div className="grid gap-4 sm:grid-cols-3">
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
          </div>
          <Skeleton className="h-72" />
        </div>
      ) : (
        <>
          {/* Balance hero */}
          <section className="relative overflow-hidden rounded-3xl border border-emerald-300/[0.14] bg-gradient-to-br from-ink-800 via-ink-850 to-ink-900 p-6 sm:p-9">
            <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-emerald-400/[0.09] blur-[90px]" />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:36px_36px] [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_70%)]" />
            <div className="relative grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-end">
              <div>
                <div className="flex items-center gap-2.5">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Available balance</p>
                </div>
                <div className="mt-4 flex items-baseline gap-3 text-zinc-50">
                  <AnimatedBalance value={Number(summary.available)} />
                  <span className="font-display text-xl font-semibold text-emerald-300">{summary.asset}</span>
                </div>
                <p className="mt-2 text-[12.5px] text-zinc-500">{summary.label}</p>
                <div className="mt-6 flex flex-wrap gap-6">
                  <div>
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                      <Hourglass className="h-3 w-3 text-amber-300/80" /> Reserved
                    </p>
                    <p className="mt-1 font-display text-[17px] font-semibold tabular-nums text-amber-200">
                      {formatAmount(summary.reserved)} <span className="text-[12px] text-zinc-500">USDT</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Total (incl. reserved)</p>
                    <p className="mt-1 font-display text-[17px] font-semibold tabular-nums text-zinc-200">
                      {formatAmount(summary.total)} <span className="text-[12px] text-zinc-500">USDT</span>
                    </p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 lg:justify-items-stretch">
                <button
                  onClick={() => setDepositOpen(true)}
                  className="group flex flex-col justify-between rounded-2xl border border-emerald-300/20 bg-emerald-400/[0.08] p-4 text-left transition hover:bg-emerald-400/[0.14]"
                >
                  <ArrowDownToLine className="h-5 w-5 text-emerald-300 transition group-hover:translate-y-0.5" />
                  <div className="mt-6">
                    <p className="text-[14px] font-bold text-emerald-100">Deposit</p>
                    <p className="text-[11.5px] text-emerald-200/60">BEP20 · TRC20</p>
                  </div>
                </button>
                <button
                  onClick={() => setSendOpen(true)}
                  className="group flex flex-col justify-between rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left transition hover:bg-white/[0.08]"
                >
                  <ArrowUpFromLine className="h-5 w-5 text-rose-300 transition group-hover:-translate-y-0.5" />
                  <div className="mt-6">
                    <p className="text-[14px] font-bold text-zinc-100">Send</p>
                    <p className="text-[11.5px] text-zinc-500">Fee {formatAmount(summary.fee.withdrawal)} USDT</p>
                  </div>
                </button>
                <div className="col-span-2 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-zinc-500">Pending requests</span>
                    <span className="font-bold tabular-nums text-zinc-200">{pendingCount}</span>
                  </div>
                  <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-400 transition-all duration-700"
                      style={{ width: `${Math.min(100, pendingCount * 25)}%` }}
                    />
                  </div>
                  <p className="mt-2 text-[11px] text-zinc-600">Awaiting payment confirmation or review</p>
                </div>
              </div>
            </div>
          </section>

          {/* Stats */}
          <section className="grid gap-4 sm:grid-cols-3">
            <StatCard
              icon={Landmark}
              label="Total deposited"
              value={formatAmount(summary.stats.totalDeposited)}
              sub="Approved deposits"
              tone="bg-emerald-400/10 text-emerald-300 ring-emerald-300/20"
            />
            <StatCard
              icon={ArrowUpFromLine}
              label="Total withdrawn"
              value={formatAmount(summary.stats.totalWithdrawn)}
              sub="Approved withdrawals"
              tone="bg-rose-400/10 text-rose-300 ring-rose-300/20"
            />
            <StatCard
              icon={Puzzle}
              label="Pending volume"
              value={formatAmount(String(Number(summary.stats.pendingDeposits.sum) + Number(summary.stats.pendingWithdrawals.sum)))}
              sub={`${pendingCount} request${pendingCount === 1 ? "" : "s"} in review`}
              tone="bg-amber-400/10 text-amber-300 ring-amber-300/20"
            />
          </section>

          {/* Chart + recent */}
          <section className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
            <div className="rounded-3xl border border-white/[0.07] bg-ink-850/60 p-5 backdrop-blur-sm sm:p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="font-display text-[16px] font-semibold">Cash flow</h2>
                  <p className="text-[12px] text-zinc-500">Simulated inflow vs outflow — last 14 days</p>
                </div>
                <div className="flex items-center gap-4 text-[11.5px] text-zinc-400">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-300" /> Inflow
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-rose-300" /> Outflow
                  </span>
                </div>
              </div>
              <ActivityChart data={activity} />
            </div>

            <div className="flex flex-col rounded-3xl border border-white/[0.07] bg-ink-850/60 backdrop-blur-sm">
              <div className="flex items-center justify-between border-b border-white/[0.06] p-5 pb-4">
                <h2 className="font-display text-[16px] font-semibold">Recent activity</h2>
                <Link href="/transactions" className="flex items-center gap-1 text-[12.5px] font-medium text-emerald-300 transition hover:text-emerald-200">
                  View all <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <div className="flex-1">
                {summary.recentTransactions.length === 0 ? (
                  <EmptyState
                    icon={ArrowDownToLine}
                    title="No activity yet"
                    description="Create a deposit request to see your first simulated transaction."
                    action={
                      <Button size="sm" onClick={() => setDepositOpen(true)}>
                        New deposit
                      </Button>
                    }
                  />
                ) : (
                  <ul className="divide-y divide-white/[0.05]">
                    {summary.recentTransactions.map((tx) => (
                      <li key={tx.id} className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-white/[0.02]">
                        <TxIcon type={tx.type} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-[13.5px] font-semibold text-zinc-100">{TX_TYPE_LABEL[tx.type]}</p>
                            <NetworkBadge network={tx.network} />
                          </div>
                          <p className="mt-0.5 text-[11.5px] text-zinc-500">{formatDateTime(tx.createdAt)}</p>
                        </div>
                        <div className="text-right">
                          <p
                            className={cn(
                              "font-display text-[14px] font-bold tabular-nums",
                              isDebit(tx.amount) ? "text-rose-300" : "text-emerald-300",
                            )}
                          >
                            {isDebit(tx.amount) ? "−" : "+"}
                            {formatAmount(tx.amount.replace("-", ""))}
                          </p>
                          <StatusPill status={tx.status} className="mt-1 scale-90" />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        </>
      )}

      {summary ? (
        <>
          <DepositModal
            open={depositOpen}
            onClose={() => setDepositOpen(false)}
            addresses={summary.depositAddresses}
            minDeposit={summary.limits.minDeposit}
            onCreated={() => void load(true)}
          />
          <SendModal
            open={sendOpen}
            onClose={() => setSendOpen(false)}
            available={summary.available}
            fee={summary.fee.withdrawal}
            minWithdrawal={summary.limits.minWithdrawal}
            onCreated={() => void load(true)}
          />
        </>
      ) : null}
    </div>
  );
}
