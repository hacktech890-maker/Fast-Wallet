"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDownWideNarrow, Download, Inbox, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/field";
import { SelectInput } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { StatusPill } from "@/components/ui/status-pill";
import { NetworkBadge } from "@/components/ui/network-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { TxIcon, TX_TYPE_LABEL } from "@/components/ui/tx-icon";
import { TransactionDetailModal } from "@/components/transactions/transaction-detail-modal";
import { transactionsApi } from "@/lib/api/transactions.api";
import { useToast } from "@/contexts/toast-context";
import { useDebounce } from "@/hooks/use-debounce";
import { formatAmount, formatDateTime, compactAmount, isDebit } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Paginated, Transaction, TransactionFilters } from "@/lib/types";

const PAGE_SIZE = 10;

const inputCls =
  "h-10 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-[13px] text-zinc-200 transition focus:border-emerald-300/50 focus:outline-none";

export default function TransactionsPage() {
  const toast = useToast();
  const [data, setData] = useState<Paginated<Transaction> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [network, setNetwork] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<"date" | "amount">("date");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState<Transaction | null>(null);

  const debouncedQ = useDebounce(q);

  const filters: TransactionFilters = {
    q: debouncedQ || undefined,
    type: (type || undefined) as TransactionFilters["type"],
    status: (status || undefined) as TransactionFilters["status"],
    network: (network || undefined) as TransactionFilters["network"],
    from: from || undefined,
    to: to || undefined,
    sort,
    order,
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await transactionsApi.list({ ...filters, page, limit: PAGE_SIZE }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load transactions");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedQ, type, status, network, from, to, sort, order]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, type, status, network, from, to, sort, order]);

  const resetFilters = () => {
    setQ("");
    setType("");
    setStatus("");
    setNetwork("");
    setFrom("");
    setTo("");
    setSort("date");
    setOrder("desc");
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await transactionsApi.exportCsv({ ...filters, limit: 50 });
      toast.success("Export ready", "Your filtered transactions were downloaded as CSV.");
    } catch (e) {
      toast.error("Export failed", e instanceof Error ? e.message : undefined);
    } finally {
      setExporting(false);
    }
  };

  const openDetail = async (id: string) => {
    try {
      const res = await transactionsApi.get(id);
      setSelected(res.transaction);
    } catch {
      toast.error("Could not load transaction");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">Ledger</p>
          <h1 className="mt-1.5 font-display text-[28px] font-bold tracking-tight sm:text-[32px]">Transaction history</h1>
        </div>
        <Button variant="secondary" onClick={handleExport} loading={exporting}>
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-white/[0.07] bg-ink-850/60 p-4 backdrop-blur-sm">
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-cols-8">
          <div className="relative col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <TextInput
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search reference, note, address…"
              className="h-10 pl-9 text-[13px]"
            />
          </div>
          <SelectInput value={type} onChange={(e) => setType(e.target.value)} className="h-10 text-[13px]" aria-label="Type">
            <option value="">All types</option>
            <option value="deposit">Deposits</option>
            <option value="withdrawal">Withdrawals</option>
            <option value="seed">Credits</option>
            <option value="adjustment">Adjustments</option>
          </SelectInput>
          <SelectInput value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 text-[13px]" aria-label="Status">
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </SelectInput>
          <SelectInput value={network} onChange={(e) => setNetwork(e.target.value)} className="h-10 text-[13px]" aria-label="Network">
            <option value="">All networks</option>
            <option value="BEP20">BEP20</option>
            <option value="TRC20">TRC20</option>
          </SelectInput>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} aria-label="From date" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} aria-label="To date" />
          <div className="flex gap-2.5">
            <SelectInput
              value={`${sort}:${order}`}
              onChange={(e) => {
                const [s, o] = e.target.value.split(":");
                setSort(s as "date" | "amount");
                setOrder(o as "asc" | "desc");
              }}
              className="h-10 text-[13px]"
              aria-label="Sort"
            >
              <option value="date:desc">Newest first</option>
              <option value="date:asc">Oldest first</option>
              <option value="amount:desc">Amount high→low</option>
              <option value="amount:asc">Amount low→high</option>
            </SelectInput>
            <Button variant="ghost" size="icon" onClick={resetFilters} aria-label="Reset filters" title="Reset filters" className="h-10 w-10 shrink-0 border border-white/10">
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-ink-850/60 backdrop-blur-sm">
        {error ? (
          <div className="p-10 text-center">
            <p className="text-[14px] font-medium text-rose-300">{error}</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        ) : loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No transactions found"
            description="Try widening your filters, or create a deposit request from the dashboard."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left">
                <thead>
                  <tr className="border-b border-white/[0.06] text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    <th className="px-5 py-3.5">Transaction</th>
                    <th className="px-4 py-3.5">Asset · Network</th>
                    <th className="px-4 py-3.5">Date</th>
                    <th className="px-4 py-3.5 text-right">
                      <span className="inline-flex items-center gap-1">
                        Amount <ArrowDownWideNarrow className="h-3 w-3" />
                      </span>
                    </th>
                    <th className="px-4 py-3.5 text-right">Fee</th>
                    <th className="px-5 py-3.5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.045]">
                  {data.items.map((tx) => (
                    <tr
                      key={tx.id}
                      onClick={() => void openDetail(tx.id)}
                      className="cursor-pointer transition hover:bg-white/[0.025]"
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <TxIcon type={tx.type} />
                          <div>
                            <p className="text-[13.5px] font-semibold text-zinc-100">{TX_TYPE_LABEL[tx.type]}</p>
                            <p className="max-w-[180px] truncate font-mono text-[10.5px] text-zinc-600">{tx.reference}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-semibold text-zinc-200">{tx.asset}</span>
                          <NetworkBadge network={tx.network} />
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-[12.5px] text-zinc-400">{formatDateTime(tx.createdAt)}</td>
                      <td
                        className={cn(
                          "px-4 py-3.5 text-right font-display text-[14px] font-bold tabular-nums",
                          isDebit(tx.amount) ? "text-rose-300" : "text-emerald-300",
                        )}
                      >
                        {isDebit(tx.amount) ? "−" : "+"}
                        {formatAmount(tx.amount.replace("-", ""))}
                      </td>
                      <td className="px-4 py-3.5 text-right text-[12.5px] tabular-nums text-zinc-500">
                        {compactAmount(tx.fee)}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <StatusPill status={tx.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-white/[0.06] px-5 py-4">
              <Pagination page={data.page} limit={data.limit} total={data.total} onPage={setPage} />
            </div>
          </>
        )}
      </div>

      <TransactionDetailModal transaction={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
