"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, Check, Search, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, SelectInput, TextInput } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { adminApi } from "@/lib/api/admin.api";
import { ApiClientError, newIdempotencyKey } from "@/lib/api/client";
import { useToast } from "@/contexts/toast-context";
import { useDebounce } from "@/hooks/use-debounce";
import { formatAmount, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AdjustmentPreview, AdminUserRow, Paginated, WalletAdjustmentRow } from "@/lib/types";

const REASONS = [
  { value: "promotional_credit", label: "Promotional credit" },
  { value: "customer_support", label: "Customer support adjustment" },
  { value: "approved_refund", label: "Approved refund" },
  { value: "correction", label: "Balance correction" },
  { value: "settlement", label: "Settlement" },
  { value: "other", label: "Other" },
];

const FUNDING = [
  { value: "not_cash_backed", label: "Not cash-backed (promotional / goodwill)" },
  { value: "bank_transfer_received", label: "Bank transfer received" },
  { value: "crypto_received", label: "Crypto received off-platform" },
  { value: "provider_settlement", label: "Payment provider settlement" },
  { value: "marketing_budget", label: "Marketing budget" },
];

const STATUS_STYLES: Record<string, string> = {
  applied: "bg-emerald-400/10 text-emerald-200 ring-emerald-300/25",
  pending_approval: "bg-amber-400/10 text-amber-200 ring-amber-300/25",
  rejected: "bg-rose-400/10 text-rose-200 ring-rose-300/25",
};

interface Props {
  canApprove: boolean;
}

export function AdjustmentsTab({ canApprove }: Props) {
  const toast = useToast();
  const [history, setHistory] = useState<Paginated<WalletAdjustmentRow> | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);

  // form state
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AdminUserRow[]>([]);
  const [selected, setSelected] = useState<AdminUserRow | null>(null);
  const [type, setType] = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USDT");
  const [reason, setReason] = useState(REASONS[0]!.value);
  const [fundingSource, setFundingSource] = useState(FUNDING[0]!.value);
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<AdjustmentPreview | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const idemKey = useRef<string | null>(null);
  const debouncedQuery = useDebounce(query);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      setHistory(await adminApi.adjustments({ page, limit: 10, status: statusFilter || undefined }));
    } catch {
      /* surfaced by the empty state */
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (!debouncedQuery || selected) {
      setResults([]);
      return;
    }
    let cancelled = false;
    void adminApi
      .users({ q: debouncedQuery, limit: 5 })
      .then((res) => !cancelled && setResults(res.items))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, selected]);

  const validAmount = /^\d+(\.\d{1,8})?$/.test(amount.trim()) && Number(amount) > 0;

  const openConfirm = async () => {
    if (!selected || !validAmount) return;
    setFormError(null);
    try {
      setPreview(await adminApi.previewAdjustment({ userId: selected.id, type, amount }));
      idemKey.current = newIdempotencyKey();
    } catch (e) {
      setFormError(e instanceof ApiClientError ? e.message : "Could not prepare the adjustment");
    }
  };

  const submit = async () => {
    if (!selected || !idemKey.current) return;
    setSubmitting(true);
    try {
      const res = await adminApi.createAdjustment({
        userId: selected.id,
        type,
        amount,
        currency,
        reason,
        note: note || undefined,
        fundingSource,
        idempotencyKey: idemKey.current,
      });
      if (res.pendingApproval) {
        toast.info("Awaiting second approval", "This high-value adjustment needs another administrator to approve it.");
      } else {
        toast.success(
          `${type === "credit" ? "Credited" : "Debited"} ${formatAmount(amount, currency)}`,
          `New balance: ${formatAmount(res.balanceAfter ?? "0", currency)} · ref ${res.adjustment.reference}`,
        );
      }
      setPreview(null);
      setSelected(null);
      setQuery("");
      setAmount("");
      setNote("");
      idemKey.current = null;
      void loadHistory();
    } catch (e) {
      setFormError(e instanceof ApiClientError ? e.message : "The adjustment failed");
    } finally {
      setSubmitting(false);
    }
  };

  const decide = async (row: WalletAdjustmentRow, approve: boolean) => {
    try {
      if (approve) await adminApi.approveAdjustment(row.id);
      else await adminApi.rejectAdjustment(row.id, "Rejected by approver");
      toast.success(approve ? "Adjustment approved and applied" : "Adjustment rejected");
      void loadHistory();
    } catch (e) {
      toast.error("Action failed", e instanceof ApiClientError ? e.message : undefined);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[1.05fr_1fr]">
        {/* ─────────────────────────── adjustment form ─────────────────────── */}
        <section className="space-y-4 rounded-2xl border border-white/[0.07] bg-ink-850/60 p-5 backdrop-blur-sm">
          <div>
            <h2 className="font-display text-[16px] font-semibold">Manual wallet adjustment</h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-zinc-500">
              Credits and debits post an immutable ledger entry. A credit is an accounting instruction — it is not proof
              that money was received, so record its funding classification.
            </p>
          </div>

          {/* user search */}
          <Field label="User" hint="Search by name, email or paste a user ID">
            {selected ? (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-300/40 bg-emerald-400/[0.07] p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-zinc-100">
                    {selected.firstName} {selected.lastName}
                  </p>
                  <p className="truncate text-[11.5px] text-zinc-400">{selected.email}</p>
                  <p className="mt-0.5 text-[11.5px] text-zinc-500">
                    Balance <span className="font-semibold text-emerald-200">{formatAmount(selected.available)}</span> ·{" "}
                    status <span className={selected.status === "active" ? "text-emerald-300" : "text-rose-300"}>{selected.status}</span>
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                  Change
                </Button>
              </div>
            ) : (
              <div className="relative">
                <TextInput
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="jane@example.com"
                  icon={<Search className="h-4 w-4" />}
                />
                {results.length > 0 ? (
                  <ul className="absolute z-20 mt-1.5 max-h-56 w-full overflow-y-auto rounded-xl border border-white/10 bg-ink-800 p-1 shadow-2xl">
                    {results.map((u) => (
                      <li key={u.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelected(u);
                            setResults([]);
                          }}
                          className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-white/[0.06]"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] text-zinc-100">{u.email}</span>
                            <span className="block text-[11px] text-zinc-500">
                              {u.firstName} {u.lastName} · {u.status}
                            </span>
                          </span>
                          <span className="shrink-0 text-[12px] tabular-nums text-emerald-300">{formatAmount(u.available)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
          </Field>

          {/* credit / debit */}
          <div className="grid grid-cols-2 gap-2.5">
            {(["credit", "debit"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl border p-3 text-left transition",
                  type === t
                    ? t === "credit"
                      ? "border-emerald-300/50 bg-emerald-400/[0.1]"
                      : "border-rose-300/50 bg-rose-400/[0.1]"
                    : "border-white/10 bg-white/[0.03] hover:border-white/20",
                )}
              >
                {t === "credit" ? (
                  <ArrowDownCircle className="h-4.5 w-4.5 text-emerald-300" />
                ) : (
                  <ArrowUpCircle className="h-4.5 w-4.5 text-rose-300" />
                )}
                <span className="text-[13px] font-semibold capitalize text-zinc-100">{t}</span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2.5">
            <Field label="Amount" hint="Any positive amount — e.g. 1.00 or 0.50">
              <TextInput value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="1.00" />
            </Field>
            <Field label="Currency">
              <SelectInput value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-28">
                <option value="USDT">USDT</option>
                <option value="USD">USD</option>
              </SelectInput>
            </Field>
          </div>

          <Field label="Reason">
            <SelectInput value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </SelectInput>
          </Field>

          <Field label="Funding classification" hint="Keeps wallet liabilities reconcilable">
            <SelectInput value={fundingSource} onChange={(e) => setFundingSource(e.target.value)}>
              {FUNDING.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </SelectInput>
          </Field>

          <Field label="Internal note" optional>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={1000}
              placeholder="Context for the audit trail (never shown to the user)"
              className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-[14px] text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-300/60 focus:outline-none"
            />
          </Field>

          {formError ? (
            <p className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-3.5 py-2.5 text-[13px] font-medium text-rose-200">
              {formError}
            </p>
          ) : null}

          <Button size="lg" className="w-full" disabled={!selected || !validAmount} onClick={() => void openConfirm()}>
            Review adjustment
          </Button>
        </section>

        {/* ─────────────────────────── history ─────────────────────────────── */}
        <section className="rounded-2xl border border-white/[0.07] bg-ink-850/60 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] p-4">
            <h2 className="font-display text-[15px] font-semibold">Adjustment history</h2>
            <SelectInput
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="h-9 max-w-[180px] text-[12.5px]"
            >
              <option value="">All statuses</option>
              <option value="pending_approval">Pending approval</option>
              <option value="applied">Applied</option>
              <option value="rejected">Rejected</option>
            </SelectInput>
          </div>

          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : !history || history.items.length === 0 ? (
            <EmptyState icon={ShieldAlert} title="No adjustments yet" description="Manual credits and debits appear here." />
          ) : (
            <>
              <ul className="divide-y divide-white/[0.045]">
                {history.items.map((row) => (
                  <li key={row.id} className="px-4 py-3.5">
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
                          row.type === "credit"
                            ? "bg-emerald-400/10 text-emerald-300 ring-emerald-300/20"
                            : "bg-rose-400/10 text-rose-300 ring-rose-300/20",
                        )}
                      >
                        {row.type === "credit" ? <ArrowDownCircle className="h-4 w-4" /> : <ArrowUpCircle className="h-4 w-4" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] font-semibold text-zinc-100">
                          {row.type === "credit" ? "+" : "−"}
                          {formatAmount(row.amount, row.currency)}
                          <span className="ml-2 text-[11.5px] font-normal text-zinc-500">{row.userEmail}</span>
                        </p>
                        <p className="text-[11.5px] text-zinc-500">
                          {row.reason.replace(/_/g, " ")} · {formatDateTime(row.createdAt)}
                        </p>
                        <p className="mt-0.5 truncate font-mono text-[10.5px] text-zinc-600">{row.reference}</p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-1 text-[10.5px] font-semibold ring-1 ring-inset",
                          STATUS_STYLES[row.status],
                        )}
                      >
                        {row.status.replace(/_/g, " ")}
                      </span>
                    </div>
                    {row.status === "pending_approval" && canApprove ? (
                      <div className="mt-2.5 flex justify-end gap-2">
                        <Button size="sm" variant="danger" onClick={() => void decide(row, false)}>
                          <X className="h-3.5 w-3.5" /> Reject
                        </Button>
                        <Button size="sm" onClick={() => void decide(row, true)}>
                          <Check className="h-3.5 w-3.5" /> Approve
                        </Button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
              <div className="border-t border-white/[0.06] px-4 py-3.5">
                <Pagination page={history.page} limit={history.limit} total={history.total} onPage={setPage} />
              </div>
            </>
          )}
        </section>
      </div>

      {/* ───────────────────────── confirmation ───────────────────────────── */}
      <Modal open={Boolean(preview)} onClose={() => setPreview(null)} title="Confirm adjustment" wide>
        {preview ? (
          <div className="space-y-4">
            <div className="divide-y divide-white/[0.05] rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4">
              {[
                ["User", `${preview.user.firstName} ${preview.user.lastName} (${preview.user.email})`],
                ["Operation", type === "credit" ? "Credit (increase balance)" : "Debit (decrease balance)"],
                ["Amount", `${formatAmount(amount, currency)}`],
                ["Reason", REASONS.find((r) => r.value === reason)?.label ?? reason],
                ["Funding", FUNDING.find((f) => f.value === fundingSource)?.label ?? fundingSource],
                ["Current balance", formatAmount(preview.currentBalance, currency)],
              ].map(([k, v]) => (
                <div key={k} className="flex items-start justify-between gap-4 py-2.5">
                  <span className="text-[12.5px] text-zinc-500">{k}</span>
                  <span className="max-w-[62%] text-right text-[13px] text-zinc-200">{v}</span>
                </div>
              ))}
              <div className="flex items-start justify-between gap-4 py-3">
                <span className="text-[12.5px] font-semibold text-zinc-300">Resulting balance</span>
                <span
                  className={cn(
                    "font-display text-[17px] font-bold tabular-nums",
                    preview.wouldGoNegative ? "text-rose-300" : "text-emerald-300",
                  )}
                >
                  {formatAmount(preview.resultingBalance, currency)}
                </span>
              </div>
            </div>

            {preview.wouldGoNegative && !preview.allowNegativeBalance ? (
              <p className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-3.5 py-2.5 text-[13px] font-medium text-rose-200">
                This debit exceeds the available balance and will be rejected by the server (negative balances are
                disabled in platform settings).
              </p>
            ) : null}

            {preview.requiresDualApproval ? (
              <p className="rounded-xl border border-amber-300/30 bg-amber-400/[0.08] px-3.5 py-2.5 text-[13px] font-medium text-amber-200">
                High-value adjustment (≥ {formatAmount(preview.highValueThreshold, currency)}). It will be queued and a
                second administrator must approve it before any money moves.
              </p>
            ) : null}

            {formError ? (
              <p className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-3.5 py-2.5 text-[13px] font-medium text-rose-200">
                {formError}
              </p>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" onClick={() => setPreview(null)} disabled={submitting}>
                Cancel
              </Button>
              <Button
                onClick={() => void submit()}
                loading={submitting}
                disabled={preview.wouldGoNegative && !preview.allowNegativeBalance}
              >
                Confirm {type}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
