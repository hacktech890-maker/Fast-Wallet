"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Inbox, Search, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectInput, TextInput } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { adminApi, downloadAdminCsv } from "@/lib/api/admin.api";
import { useToast } from "@/contexts/toast-context";
import { useDebounce } from "@/hooks/use-debounce";
import { formatAmount, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { LedgerResponse } from "@/lib/types";

export function LedgerTab({ canExport }: { canExport: boolean }) {
  const toast = useToast();
  const [data, setData] = useState<LedgerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [exporting, setExporting] = useState(false);
  const debouncedQ = useDebounce(q);

  const filters = {
    q: debouncedQ || undefined,
    type: type || undefined,
    status: status || undefined,
    minAmount: /^\d+(\.\d{1,8})?$/.test(minAmount) ? minAmount : undefined,
    from: from || undefined,
    to: to || undefined,
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await adminApi.ledger({ ...filters, page, limit: 20 }));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedQ, type, status, minAmount, from, to]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => setPage(1), [debouncedQ, type, status, minAmount, from, to]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadAdminCsv("/admin/ledger/export", "fastwallet-ledger.csv", filters);
      toast.success("Ledger exported", "The export was recorded in the audit log.");
    } catch {
      toast.error("Export failed", "You may not have the ledger.export permission.");
    } finally {
      setExporting(false);
    }
  };

  const inputCls = "h-10 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-[13px] text-zinc-200 focus:border-emerald-300/50 focus:outline-none";

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/[0.07] bg-ink-850/60 p-4 backdrop-blur-sm">
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-7">
          <div className="relative col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Reference, email, note…" className="h-10 pl-9 text-[13px]" />
          </div>
          <SelectInput value={type} onChange={(e) => setType(e.target.value)} className="h-10 text-[13px]">
            <option value="">All types</option>
            <option value="deposit">Deposit</option>
            <option value="withdrawal">Withdrawal</option>
            <option value="admin_credit">Admin credit</option>
            <option value="admin_debit">Admin debit</option>
            <option value="adjustment">Adjustment</option>
          </SelectInput>
          <SelectInput value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 text-[13px]">
            <option value="">All statuses</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </SelectInput>
          <TextInput value={minAmount} onChange={(e) => setMinAmount(e.target.value)} placeholder="Min amount" className="h-10 text-[13px]" inputMode="decimal" />
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} aria-label="From" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} aria-label="To" />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12px] text-zinc-500">
            Credits <span className="font-semibold text-emerald-300">{formatAmount(data?.totals.credits ?? "0")}</span> · Debits{" "}
            <span className="font-semibold text-rose-300">{formatAmount(data?.totals.debits ?? "0")}</span>
            <span className="ml-2 text-zinc-600">entries are immutable — corrections use compensating adjustments</span>
          </p>
          {canExport ? (
            <Button size="sm" variant="secondary" onClick={() => void exportCsv()} loading={exporting}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
          ) : null}
        </div>
      </div>

      {data && data.anomalies.duplicateReferences.length > 0 ? (
        <div className="flex items-start gap-2.5 rounded-2xl border border-rose-400/30 bg-rose-400/[0.08] p-4">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
          <div>
            <p className="text-[13px] font-semibold text-rose-100">Reconciliation anomaly: duplicate references</p>
            <p className="mt-0.5 font-mono text-[11.5px] text-rose-200/80">
              {data.anomalies.duplicateReferences.map((d) => `${d.reference} ×${d.count}`).join(", ")}
            </p>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-ink-850/60 backdrop-blur-sm">
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : !data || data.items.length === 0 ? (
          <EmptyState icon={Inbox} title="No ledger entries" description="Adjust the filters to widen your search." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-left">
                <thead>
                  <tr className="border-b border-white/[0.06] text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    <th className="px-5 py-3.5">Date</th>
                    <th className="px-4 py-3.5">User</th>
                    <th className="px-4 py-3.5">Type</th>
                    <th className="px-4 py-3.5 text-right">Debit</th>
                    <th className="px-4 py-3.5 text-right">Credit</th>
                    <th className="px-4 py-3.5 text-right">Balance after</th>
                    <th className="px-4 py-3.5">Reference</th>
                    <th className="px-5 py-3.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.045]">
                  {data.items.map((row) => {
                    const isDebit = row.amount.startsWith("-");
                    return (
                      <tr key={row.id} className="transition hover:bg-white/[0.02]">
                        <td className="px-5 py-3 text-[12px] text-zinc-400">{formatDateTime(row.createdAt)}</td>
                        <td className="px-4 py-3 text-[12.5px] text-zinc-300">{row.userEmail}</td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ring-1 ring-inset",
                              row.type.startsWith("admin")
                                ? "bg-violet-400/10 text-violet-200 ring-violet-300/20"
                                : "bg-white/[0.06] text-zinc-300 ring-white/10",
                            )}
                          >
                            {row.type.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-[13px] tabular-nums text-rose-300">
                          {isDebit ? formatAmount(row.amount.replace("-", "")) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-[13px] tabular-nums text-emerald-300">
                          {!isDebit ? formatAmount(row.amount) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-[12.5px] tabular-nums text-zinc-400">
                          {row.balanceAfter ? formatAmount(row.balanceAfter) : "—"}
                        </td>
                        <td className="max-w-[180px] truncate px-4 py-3 font-mono text-[10.5px] text-zinc-500" title={row.reference}>
                          {row.reference}
                        </td>
                        <td className="px-5 py-3">
                          <StatusPill status={row.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t border-white/[0.06] px-5 py-4">
              <Pagination page={data.page} limit={data.limit} total={data.total} onPage={setPage} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
