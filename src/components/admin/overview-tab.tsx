"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  CircleDollarSign,
  Scale,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectInput } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { ActivityChart } from "@/components/charts/activity-chart";
import { StatusPill } from "@/components/ui/status-pill";
import { adminApi } from "@/lib/api/admin.api";
import { formatAmount, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DashboardStats } from "@/lib/types";

function Stat({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof UsersRound;
  label: string;
  value: string;
  sub?: string;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-ink-850/60 p-4 backdrop-blur-sm">
      <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg ring-1 ring-inset", tone)}>
        <Icon className="h-4 w-4" strokeWidth={2.25} />
      </div>
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{label}</p>
      <p className="mt-1 font-display text-[21px] font-bold tabular-nums tracking-tight text-zinc-50">{value}</p>
      {sub ? <p className="mt-0.5 text-[11.5px] text-zinc-500">{sub}</p> : null}
    </div>
  );
}

export function OverviewTab() {
  const [data, setData] = useState<DashboardStats | null>(null);
  const [range, setRange] = useState("week");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const stats = await adminApi.stats({ range });
      setData(stats);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard");
    }
  }, [range]);

  // State updates happen only after the request resolves, and are skipped if
  // the range changed (or the tab unmounted) while it was in flight.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stats = await adminApi.stats({ range });
        if (cancelled) return;
        setData(stats);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load dashboard");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [range]);

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-400/25 bg-rose-400/[0.07] p-8 text-center">
        <p className="text-[14px] font-medium text-rose-200">{error}</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] text-zinc-500">
          Live figures from the database · {formatDateTime(data.range.from)} → {formatDateTime(data.range.to)}
        </p>
        <SelectInput value={range} onChange={(e) => setRange(e.target.value)} className="h-9 max-w-[160px] text-[12.5px]">
          <option value="day">Last 24 hours</option>
          <option value="week">Last 7 days</option>
          <option value="month">Last 30 days</option>
        </SelectInput>
      </div>

      {/* Accounting clarity banner */}
      <div className="rounded-2xl border border-sky-300/20 bg-sky-400/[0.06] p-4">
        <p className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] text-sky-300">
          <Scale className="h-3.5 w-3.5" /> Wallet liabilities ≠ revenue
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-4">
          <div>
            <p className="text-[11px] text-zinc-500">Owed to users (total)</p>
            <p className="font-display text-[20px] font-bold tabular-nums text-sky-100">{formatAmount(data.liabilities.total)}</p>
          </div>
          <div>
            <p className="text-[11px] text-zinc-500">Card payments confirmed</p>
            <p className="font-display text-[20px] font-bold tabular-nums text-emerald-200">{formatAmount(data.deposits.cardConfirmed)}</p>
          </div>
          <div>
            <p className="text-[11px] text-zinc-500">Crypto verified on-chain</p>
            <p className="font-display text-[20px] font-bold tabular-nums text-emerald-200">{formatAmount(data.deposits.cryptoVerified)}</p>
          </div>
          <div>
            <p className="text-[11px] text-zinc-500">Manual credits (not cash-backed)</p>
            <p className="font-display text-[20px] font-bold tabular-nums text-amber-200">{formatAmount(data.liabilities.notCashBacked)}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={UsersRound}
          label="Users"
          value={String(data.users.total)}
          sub={`${data.users.active} active · ${data.users.suspended} suspended · ${data.users.banned} banned`}
          tone="bg-sky-400/10 text-sky-300 ring-sky-300/20"
        />
        <Stat
          icon={CircleDollarSign}
          label="Wallet liabilities"
          value={formatAmount(data.liabilities.total)}
          sub={`${data.liabilities.fundedWallets} funded wallets`}
          tone="bg-emerald-400/10 text-emerald-300 ring-emerald-300/20"
        />
        <Stat
          icon={ArrowDownToLine}
          label="Deposits approved"
          value={formatAmount(data.deposits.approvedSum)}
          sub={`${data.deposits.pending} pending · ${data.deposits.rejected} rejected`}
          tone="bg-emerald-400/10 text-emerald-300 ring-emerald-300/20"
        />
        <Stat
          icon={ArrowUpFromLine}
          label="Withdrawals paid"
          value={formatAmount(data.withdrawals.approvedSum)}
          sub={`${data.withdrawals.pending} pending · fees ${formatAmount(data.withdrawals.feesCollected)}`}
          tone="bg-rose-400/10 text-rose-300 ring-rose-300/20"
        />
        <Stat
          icon={Scale}
          label="Admin credits"
          value={formatAmount(data.adjustments.credits)}
          sub={`${formatAmount(data.adjustments.debits)} debited · ${data.adjustments.pendingApproval} awaiting approval`}
          tone="bg-violet-400/10 text-violet-300 ring-violet-300/20"
        />
        <Stat
          icon={Activity}
          label="Payment events"
          value={String(data.payments.events)}
          sub={`${data.payments.completed} completed · ${data.payments.expired} expired`}
          tone="bg-teal-400/10 text-teal-300 ring-teal-300/20"
        />
        <Stat
          icon={AlertTriangle}
          label="Open alerts"
          value={String(data.security.openAlerts)}
          sub={`${data.security.criticalAlerts} high severity`}
          tone="bg-amber-400/10 text-amber-300 ring-amber-300/20"
        />
        <Stat
          icon={AlertTriangle}
          label="Failed logins"
          value={String(data.security.failedLogins)}
          sub="in selected range"
          tone="bg-rose-400/10 text-rose-300 ring-rose-300/20"
        />
      </div>

      <div className="rounded-2xl border border-white/[0.07] bg-ink-850/60 p-5 backdrop-blur-sm">
        <h3 className="font-display text-[15px] font-semibold">Platform cash flow</h3>
        <p className="mb-3 text-[12px] text-zinc-500">Completed ledger movements per day</p>
        <ActivityChart data={data.series.map((s) => ({ date: s.date.slice(5), inflow: s.inflow, outflow: s.outflow }))} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/[0.07] bg-ink-850/60 backdrop-blur-sm">
          <h3 className="border-b border-white/[0.06] p-4 font-display text-[15px] font-semibold">Recent transactions</h3>
          <ul className="divide-y divide-white/[0.045]">
            {data.recentTransactions.map((tx) => (
              <li key={tx.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-zinc-200">{tx.userEmail}</p>
                  <p className="text-[11px] text-zinc-500">
                    {tx.type.replace(/_/g, " ")} · {formatDateTime(tx.createdAt)}
                  </p>
                </div>
                <span
                  className={cn(
                    "font-display text-[13.5px] font-bold tabular-nums",
                    tx.amount.startsWith("-") ? "text-rose-300" : "text-emerald-300",
                  )}
                >
                  {formatAmount(tx.amount.replace("-", ""))}
                </span>
                <StatusPill status={tx.status} className="scale-90" />
              </li>
            ))}
            {data.recentTransactions.length === 0 ? (
              <li className="px-4 py-8 text-center text-[13px] text-zinc-500">No transactions yet</li>
            ) : null}
          </ul>
        </div>

        <div className="rounded-2xl border border-white/[0.07] bg-ink-850/60 backdrop-blur-sm">
          <h3 className="border-b border-white/[0.06] p-4 font-display text-[15px] font-semibold">Recent admin actions</h3>
          <ul className="divide-y divide-white/[0.045]">
            {data.recentAdminActions.map((log) => (
              <li key={log.id} className="px-4 py-3">
                <p className="font-mono text-[11.5px] text-emerald-200/90">{log.action}</p>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  {log.actorEmail ?? "system"} · {formatDateTime(log.createdAt)}
                </p>
              </li>
            ))}
            {data.recentAdminActions.length === 0 ? (
              <li className="px-4 py-8 text-center text-[13px] text-zinc-500">No administrative activity yet</li>
            ) : null}
          </ul>
        </div>
      </div>
    </div>
  );
}
