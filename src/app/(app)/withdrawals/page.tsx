"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowUpFromLine, Ban, Inbox, ShieldCheck, Wallet2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { StatusPill } from "@/components/ui/status-pill";
import { NetworkBadge } from "@/components/ui/network-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { SendModal } from "@/components/wallet/send-modal";
import { withdrawalsApi } from "@/lib/api/withdrawals.api";
import { walletApi } from "@/lib/api/wallet.api";
import { ApiClientError } from "@/lib/api/client";
import { useToast } from "@/contexts/toast-context";
import { formatAmount, formatDateTime, shortAddress } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Paginated, RequestStatus, WalletSummary, WithdrawalRequest } from "@/lib/types";

const PAGE_SIZE = 10;
const STATUS_TABS: { value: "" | RequestStatus; label: string }[] = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
];

export default function WithdrawalsPage() {
  const toast = useToast();
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [data, setData] = useState<Paginated<WithdrawalRequest> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"" | RequestStatus>("");
  const [page, setPage] = useState(1);
  const [sendOpen, setSendOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<WithdrawalRequest | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const loadSummary = useCallback(async () => {
    try {
      setSummary(await walletApi.summary());
    } catch {
      /* header chips degrade gracefully */
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await withdrawalsApi.list({ page, limit: PAGE_SIZE, status: status || undefined }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load withdrawals");
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    void load();
  }, [load]);

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await withdrawalsApi.cancel(cancelTarget.id);
      toast.success("Withdrawal cancelled", "The reserved funds were restored to your available balance.");
      setCancelTarget(null);
      void load();
      void loadSummary();
    } catch (e) {
      toast.error("Could not cancel", e instanceof ApiClientError ? e.message : "Unexpected error");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">Withdrawal management</p>
          <h1 className="mt-1.5 font-display text-[28px] font-bold tracking-tight sm:text-[32px]">Withdrawals</h1>
        </div>
        <Button onClick={() => setSendOpen(true)} disabled={!summary}>
          <ArrowUpFromLine className="h-4 w-4" />
          New withdrawal
        </Button>
      </div>

      {/* Balance strip */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-3.5 rounded-2xl border border-white/[0.07] bg-ink-850/60 p-4.5 backdrop-blur-sm sm:p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300 ring-1 ring-inset ring-emerald-300/20">
            <Wallet2 className="h-4.5 w-4.5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Available</p>
            <p className="mt-0.5 font-display text-[20px] font-bold tabular-nums text-zinc-50">
              {summary ? formatAmount(summary.available) : "—"} <span className="text-[12px] font-medium text-zinc-500">USDT</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3.5 rounded-2xl border border-white/[0.07] bg-ink-850/60 p-4.5 backdrop-blur-sm sm:p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/10 text-amber-300 ring-1 ring-inset ring-amber-300/20">
            <ShieldCheck className="h-4.5 w-4.5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Reserved in review</p>
            <p className="mt-0.5 font-display text-[20px] font-bold tabular-nums text-zinc-50">
              {summary ? formatAmount(summary.reserved) : "—"} <span className="text-[12px] font-medium text-zinc-500">USDT</span>
            </p>
          </div>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex flex-wrap gap-1.5 rounded-2xl border border-white/[0.07] bg-ink-850/60 p-1.5 backdrop-blur-sm">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.label}
            onClick={() => {
              setStatus(tab.value);
              setPage(1);
            }}
            className={cn(
              "rounded-xl px-3.5 py-2 text-[13px] font-medium transition",
              status === tab.value
                ? "bg-emerald-400/15 text-emerald-200 ring-1 ring-emerald-300/25"
                : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100",
            )}
          >
            {tab.label}
          </button>
        ))}
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
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No withdrawals here"
            description={
              status
                ? `No ${status} withdrawal requests. Try another tab.`
                : "Create your first simulated withdrawal request — funds stay reserved until review is complete."
            }
            action={
              !status ? (
                <Button size="sm" onClick={() => setSendOpen(true)} disabled={!summary}>
                  New withdrawal
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left">
                <thead>
                  <tr className="border-b border-white/[0.06] text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    <th className="px-5 py-3.5">Created</th>
                    <th className="px-4 py-3.5">Transfer code</th>
                    <th className="px-4 py-3.5">Destination</th>
                    <th className="px-4 py-3.5 text-right">Amount</th>
                    <th className="px-4 py-3.5 text-right">Fee</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.045]">
                  {data.items.map((wd) => (
                    <tr key={wd.id} className="transition hover:bg-white/[0.02]">
                      <td className="px-5 py-3.5 text-[12.5px] text-zinc-400">{formatDateTime(wd.createdAt)}</td>
                      <td className="px-4 py-3.5">
                        {wd.transferCode ? (
                          <span className="rounded-lg bg-emerald-400/10 px-2 py-1 font-mono text-[11.5px] font-bold tracking-wider text-emerald-200 ring-1 ring-inset ring-emerald-300/20">
                            {wd.transferCode}
                          </span>
                        ) : (
                          <NetworkBadge network={wd.network} />
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        {wd.destinationAddress ? (
                          <span className="font-mono text-[12px] text-zinc-300" title={wd.destinationAddress}>
                            {shortAddress(wd.destinationAddress, 10, 6)}
                          </span>
                        ) : (
                          <span className="text-[12px] text-zinc-600">Code payout</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right font-display text-[14px] font-bold tabular-nums text-zinc-100">
                        {formatAmount(wd.amount)}
                      </td>
                      <td className="px-4 py-3.5 text-right text-[12.5px] tabular-nums text-zinc-500">{formatAmount(wd.fee)}</td>
                      <td className="px-4 py-3.5">
                        <StatusPill status={wd.status} />
                        {wd.reviewNote && wd.status !== "pending" ? (
                          <p className="mt-1 max-w-[180px] truncate text-[10.5px] text-zinc-600" title={wd.reviewNote}>
                            {wd.reviewNote}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {wd.status === "pending" ? (
                          <Button variant="danger" size="sm" onClick={() => setCancelTarget(wd)}>
                            <Ban className="h-3.5 w-3.5" />
                            Cancel
                          </Button>
                        ) : (
                          <span className="text-[11.5px] text-zinc-600">—</span>
                        )}
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

      {/* Cancel confirmation */}
      <Modal open={Boolean(cancelTarget)} onClose={() => setCancelTarget(null)} title="Cancel withdrawal?">
        {cancelTarget ? (
          <div className="space-y-5">
            <p className="text-[14px] leading-relaxed text-zinc-400">
              This cancels transfer{" "}
              <span className="font-mono font-semibold text-emerald-200">{cancelTarget.transferCode ?? cancelTarget.id.slice(0, 8)}</span> for{" "}
              <span className="font-semibold text-zinc-100">{formatAmount(cancelTarget.amount, "USDT")}</span> and instantly restores{" "}
              <span className="font-semibold text-emerald-300">
                {formatAmount(String(Number(cancelTarget.amount) + Number(cancelTarget.fee)), "USDT")}
              </span>{" "}
              (amount + fee) to your available balance.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" onClick={() => setCancelTarget(null)} disabled={cancelling}>
                Keep request
              </Button>
              <Button variant="danger" onClick={() => void confirmCancel()} loading={cancelling}>
                Cancel withdrawal
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      {summary ? (
        <SendModal
          open={sendOpen}
          onClose={() => {
            setSendOpen(false);
            void loadSummary();
          }}
          available={summary.available}
          fee={summary.fee.withdrawal}
          minWithdrawal={summary.limits.minWithdrawal}
          onCreated={() => {
            void load();
            void loadSummary();
          }}
        />
      ) : null}
    </div>
  );
}
