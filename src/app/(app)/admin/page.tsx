"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Ban,
  BookOpenCheck,
  CircleCheck,
  ClipboardCheck,
  FileClock,
  Gauge,
  Landmark,
  PlusCircle,
  Radar,
  Scale,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { OverviewTab } from "@/components/admin/overview-tab";
import { AdjustmentsTab } from "@/components/admin/adjustments-tab";
import { AddFundsDialog } from "@/components/admin/add-funds-dialog";
import { LedgerTab } from "@/components/admin/ledger-tab";
import { SettingsTab } from "@/components/admin/settings-tab";
import { SecurityTab } from "@/components/admin/security-tab";
import { Button } from "@/components/ui/button";
import { TextInput, SelectInput } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { StatusPill } from "@/components/ui/status-pill";
import { NetworkBadge } from "@/components/ui/network-badge";
import { CopyField } from "@/components/ui/copy-field";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ReviewDialog, type ReviewTarget } from "@/components/admin/review-dialog";
import { Modal } from "@/components/ui/modal";
import { adminApi, type PendingApprovals } from "@/lib/api/admin.api";
import type { AdminIdentity } from "@/lib/types";
import { ApiClientError } from "@/lib/api/client";
import { useToast } from "@/contexts/toast-context";
import { useAuth } from "@/contexts/auth-context";
import { useDebounce } from "@/hooks/use-debounce";
import { formatAmount, formatDateTime, initials, shortAddress } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  AdminDepositRow,
  AdminUserRow,
  AdminWithdrawalRow,
  AuditLogRow,
  Paginated,
  RequestStatus,
} from "@/lib/types";

const PAGE_SIZE = 10;

type TabId =
  | "overview"
  | "approvals"
  | "users"
  | "adjustments"
  | "deposits"
  | "withdrawals"
  | "ledger"
  | "settings"
  | "security"
  | "audits";

/** Tabs are permission-aware for usability; the server re-checks every call. */
const TABS: { id: TabId; label: string; icon: typeof UsersRound; permission: string }[] = [
  { id: "overview", label: "Overview", icon: Gauge, permission: "dashboard.view" },
  { id: "approvals", label: "Approvals", icon: ClipboardCheck, permission: "dashboard.view" },
  { id: "adjustments", label: "Wallet adjustments", icon: Scale, permission: "wallet.adjust" },
  { id: "users", label: "Users", icon: UsersRound, permission: "users.view" },
  { id: "deposits", label: "Deposits", icon: Landmark, permission: "deposits.view" },
  { id: "withdrawals", label: "Withdrawals", icon: WalletCards, permission: "withdrawals.view" },
  { id: "ledger", label: "Ledger", icon: BookOpenCheck, permission: "ledger.view" },
  { id: "settings", label: "Settings", icon: SlidersHorizontal, permission: "settings.view" },
  { id: "security", label: "Security", icon: Radar, permission: "security.view" },
  { id: "audits", label: "Audit log", icon: FileClock, permission: "audit.view" },
];

/* -------------------------------------------------------------- approvals */

function ApprovalsTab({ openReview }: { openReview: (t: ReviewTarget) => void }) {
  const [data, setData] = useState<PendingApprovals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await adminApi.approvals());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load approvals");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const handler = () => void load();
    window.addEventListener("fw:reviewed", handler);
    return () => window.removeEventListener("fw:reviewed", handler);
  }, [load]);

  const total = (data?.counts.deposits ?? 0) + (data?.counts.withdrawals ?? 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Awaiting action", value: total, tone: "text-amber-200" },
          { label: "Deposits", value: data?.counts.deposits ?? 0, tone: "text-emerald-200" },
          { label: "Withdrawals", value: data?.counts.withdrawals ?? 0, tone: "text-rose-200" },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-white/[0.07] bg-ink-850/60 p-4 backdrop-blur-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{s.label}</p>
            <p className={cn("mt-1 font-display text-[24px] font-bold tabular-nums", s.tone)}>{s.value}</p>
          </div>
        ))}
      </div>

      <Panel loading={loading} error={error} onRetry={() => void load()} skeletons={4}>
        {data && total > 0 ? (
          <ul className="divide-y divide-white/[0.045]">
            {data.deposits.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-4 transition hover:bg-white/[0.02]">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300 ring-1 ring-inset ring-emerald-300/20">
                  <Landmark className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold text-zinc-100">
                    Deposit · <span className="text-emerald-300">+{formatAmount(d.amount, "USDT")}</span>
                  </p>
                  <p className="truncate text-[11.5px] text-zinc-500">
                    {d.userEmail} · {formatDateTime(d.createdAt)}
                  </p>
                  {d.txReference ? (
                    <p className="mt-0.5 truncate font-mono text-[10.5px] text-zinc-600" title={d.txReference}>
                      {d.txReference}
                    </p>
                  ) : null}
                </div>
                <Button
                  size="sm"
                  onClick={() => openReview({ kind: "deposit", id: d.id, summary: `${formatAmount(d.amount, "USDT")} · ${d.userEmail} · BEP20 deposit` })}
                >
                  Review
                </Button>
              </li>
            ))}
            {data.withdrawals.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-3 px-5 py-4 transition hover:bg-white/[0.02]">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-400/10 text-rose-300 ring-1 ring-inset ring-rose-300/20">
                  <WalletCards className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold text-zinc-100">
                    Transfer · <span className="text-rose-300">−{formatAmount(String(Number(w.amount) + Number(w.fee)), "USDT")}</span>
                    {w.transferCode ? (
                      <span className="ml-2 rounded-md bg-emerald-400/10 px-1.5 py-0.5 font-mono text-[10.5px] font-bold tracking-wider text-emerald-200 ring-1 ring-inset ring-emerald-300/20">
                        {w.transferCode}
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-[11.5px] text-zinc-500">
                    {w.userEmail} · {formatDateTime(w.createdAt)}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => openReview({ kind: "withdrawal", id: w.id, summary: `${w.transferCode ?? ""} · ${formatAmount(w.amount, "USDT")} + fee · ${w.userEmail}` })}
                >
                  Review
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={ClipboardCheck} title="Nothing awaiting approval" description="New deposit and transfer requests will appear here instantly." />
        )}
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ users */

function UsersTab({ canAddFunds }: { canAddFunds: boolean }) {
  const toast = useToast();
  const [data, setData] = useState<Paginated<AdminUserRow> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [blockTarget, setBlockTarget] = useState<AdminUserRow | null>(null);
  const [blockReason, setBlockReason] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AdminUserRow | null>(null);
  const [fundsTarget, setFundsTarget] = useState<AdminUserRow | null>(null);
  const [confirmEmail, setConfirmEmail] = useState("");
  const debouncedQ = useDebounce(q);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await adminApi.users({ page, limit: PAGE_SIZE, q: debouncedQ || undefined }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedQ]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => setPage(1), [debouncedQ]);

  const applyBlock = async (user: AdminUserRow, blocked: boolean, reason?: string) => {
    setBusyId(user.id);
    try {
      await adminApi.setBlocked(user.id, { blocked, reason });
      toast.success(
        blocked ? "User blocked" : "User unblocked",
        blocked ? `${user.email} was signed out and can no longer access the platform.` : `${user.email} can sign in again.`,
      );
      setBlockTarget(null);
      setBlockReason("");
      void load();
    } catch (e) {
      toast.error("Action failed", e instanceof ApiClientError ? e.message : "Unexpected error");
    } finally {
      setBusyId(null);
    }
  };

  const applyDelete = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    try {
      await adminApi.deleteUser(deleteTarget.id);
      toast.success("User deleted", `${deleteTarget.email} and all related records were permanently removed.`);
      setDeleteTarget(null);
      setConfirmEmail("");
      void load();
    } catch (e) {
      toast.error("Delete failed", e instanceof ApiClientError ? e.message : "Unexpected error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email…" className="h-10 pl-9 text-[13px]" />
      </div>
      <Panel loading={loading} error={error} onRetry={() => void load()} skeletons={5}>
        {data && data.items.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left">
                <thead>
                  <tr className="border-b border-white/[0.06] text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    <th className="px-5 py-3.5">User</th>
                    <th className="px-4 py-3.5">Role</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5 text-right">Available</th>
                    <th className="px-4 py-3.5 text-right">Reserved</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.045]">
                  {data.items.map((u) => (
                    <tr key={u.id} className="transition hover:bg-white/[0.02]">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-400/15 text-[11px] font-bold text-emerald-200 ring-1 ring-emerald-300/20">
                            {initials(u.firstName, u.lastName)}
                          </span>
                          <div>
                            <p className="text-[13.5px] font-semibold text-zinc-100">
                              {u.firstName} {u.lastName}
                            </p>
                            <p className="text-[11.5px] text-zinc-500">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1", u.role === "admin" ? "bg-amber-400/15 text-amber-300 ring-amber-300/25" : "bg-white/[0.06] text-zinc-400 ring-white/10")}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        {u.status === "blocked" ? (
                          <span
                            className="inline-flex items-center gap-1.5 rounded-full bg-rose-400/10 px-2.5 py-1 text-[11.5px] font-medium text-rose-200 ring-1 ring-inset ring-rose-300/25"
                            title={u.blockedReason ?? undefined}
                          >
                            <Ban className="h-3 w-3" /> Blocked
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-[11.5px] font-medium text-emerald-200 ring-1 ring-inset ring-emerald-300/25">
                            <CircleCheck className="h-3 w-3" /> Active
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right font-display text-[13.5px] font-bold tabular-nums text-zinc-100">
                        {formatAmount(u.available)}
                      </td>
                      <td className="px-4 py-3.5 text-right text-[13px] tabular-nums text-amber-200/80">{formatAmount(u.reserved)}</td>
                      <td className="px-5 py-3.5">
                        {u.role === "admin" ? (
                          <p className="text-right text-[11px] text-zinc-600">Platform admin</p>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            {canAddFunds && u.status !== "blocked" ? (
                              <Button size="sm" disabled={busyId === u.id} onClick={() => setFundsTarget(u)}>
                                <PlusCircle className="h-3.5 w-3.5" />
                                Add funds
                              </Button>
                            ) : null}
                            {u.status === "blocked" ? (
                              <Button size="sm" variant="secondary" loading={busyId === u.id} onClick={() => void applyBlock(u, false)}>
                                Unblock
                              </Button>
                            ) : (
                              <Button size="sm" variant="secondary" disabled={busyId === u.id} onClick={() => setBlockTarget(u)}>
                                <Ban className="h-3.5 w-3.5" />
                                Block
                              </Button>
                            )}
                            <Button size="sm" variant="danger" disabled={busyId === u.id} onClick={() => setDeleteTarget(u)} aria-label="Delete user">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
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
        ) : (
          <EmptyState icon={UsersRound} title="No users found" description="Adjust your search." />
        )}
      </Panel>

      {/* Block confirmation */}
      <Modal open={Boolean(blockTarget)} onClose={() => setBlockTarget(null)} title="Block this user?">
        {blockTarget ? (
          <div className="space-y-4">
            <p className="text-[14px] leading-relaxed text-zinc-400">
              <span className="font-semibold text-zinc-100">{blockTarget.email}</span> will be signed out immediately and
              will not be able to sign in or use any part of the platform until unblocked. Their balance and history are
              preserved.
            </p>
            <label className="block space-y-1.5">
              <span className="text-[13px] font-medium text-zinc-300">
                Reason <span className="text-[11px] font-normal text-zinc-500">optional, recorded in the audit log</span>
              </span>
              <textarea
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                rows={3}
                maxLength={300}
                placeholder="e.g. suspicious deposit activity"
                className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-[14px] text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-300/60 focus:outline-none"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" onClick={() => setBlockTarget(null)} disabled={busyId !== null}>
                Cancel
              </Button>
              <Button variant="danger" loading={busyId === blockTarget.id} onClick={() => void applyBlock(blockTarget, true, blockReason || undefined)}>
                <Ban className="h-4 w-4" />
                Block user
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Delete confirmation */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => {
          setDeleteTarget(null);
          setConfirmEmail("");
        }}
        title="Permanently delete user?"
      >
        {deleteTarget ? (
          <div className="space-y-4">
            <p className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-3.5 py-3 text-[13px] leading-relaxed text-rose-100">
              This permanently removes <span className="font-semibold">{deleteTarget.email}</span>, their wallet, deposits,
              transfers and transaction history. They lose access to the platform instantly. This cannot be undone.
            </p>
            <label className="block space-y-1.5">
              <span className="text-[13px] font-medium text-zinc-300">
                Type <span className="font-mono text-zinc-100">{deleteTarget.email}</span> to confirm
              </span>
              <TextInput
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                placeholder={deleteTarget.email}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setDeleteTarget(null);
                  setConfirmEmail("");
                }}
                disabled={busyId !== null}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                loading={busyId === deleteTarget.id}
                disabled={confirmEmail.trim().toLowerCase() !== deleteTarget.email.toLowerCase()}
                onClick={() => void applyDelete()}
              >
                <Trash2 className="h-4 w-4" />
                Delete forever
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <AddFundsDialog user={fundsTarget} onClose={() => setFundsTarget(null)} onDone={() => void load()} />
    </div>
  );
}

/* --------------------------------------------------------------- requests */

function StatusFilter({ value, onChange }: { value: string; onChange: (v: "" | RequestStatus) => void }) {
  return (
    <SelectInput value={value} onChange={(e) => onChange(e.target.value as "" | RequestStatus)} className="h-10 max-w-[220px] text-[13px]" aria-label="Status filter">
      <option value="">All statuses</option>
      <option value="pending">Pending review</option>
      <option value="approved">Approved</option>
      <option value="rejected">Rejected</option>
      <option value="cancelled">Cancelled</option>
    </SelectInput>
  );
}

function useReviewQueue<T>(fetcher: (params: { page: number; limit: number; status?: RequestStatus }) => Promise<Paginated<T>>) {
  const [data, setData] = useState<Paginated<T> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<"" | RequestStatus>("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetcher({ page, limit: PAGE_SIZE, status: status || undefined }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [fetcher, page, status]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => setPage(1), [status]);

  return { data, loading, error, page, status, setPage, setStatus, load };
}

function Panel({
  loading,
  error,
  onRetry,
  children,
  skeletons,
}: {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  children: React.ReactNode;
  skeletons: number;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-ink-850/60 backdrop-blur-sm">
      {error ? (
        <div className="p-10 text-center">
          <p className="text-[14px] font-medium text-rose-300">{error}</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
            Retry
          </Button>
        </div>
      ) : loading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: skeletons }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : (
        children
      )}
    </div>
  );
}

function DepositsTab({ openReview }: { openReview: (t: ReviewTarget) => void }) {
  const fetcher = useCallback((p: { page: number; limit: number; status?: RequestStatus }) => adminApi.deposits(p), []);
  const { data, loading, error, page, status, setPage, setStatus, load } = useReviewQueue<AdminDepositRow>(fetcher);

  // Refresh after reviews from parent
  useEffect(() => {
    const handler = () => void load();
    window.addEventListener("fw:reviewed", handler);
    return () => window.removeEventListener("fw:reviewed", handler);
  }, [load]);

  return (
    <div className="space-y-4">
      <StatusFilter value={status} onChange={setStatus} />
      <Panel loading={loading} error={error} onRetry={() => void load()} skeletons={4}>
        {data && data.items.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-left">
                <thead>
                  <tr className="border-b border-white/[0.06] text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    <th className="px-5 py-3.5">Created</th>
                    <th className="px-4 py-3.5">User</th>
                    <th className="px-4 py-3.5">Network</th>
                    <th className="px-4 py-3.5 text-right">Amount</th>
                    <th className="px-4 py-3.5">Reference</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">Review</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.045]">
                  {data.items.map((d) => (
                    <tr key={d.id} className="transition hover:bg-white/[0.02]">
                      <td className="px-5 py-3.5 text-[12.5px] text-zinc-400">{formatDateTime(d.createdAt)}</td>
                      <td className="px-4 py-3.5 text-[13px] text-zinc-300">{d.userEmail}</td>
                      <td className="px-4 py-3.5"><NetworkBadge network={d.network} /></td>
                      <td className="px-4 py-3.5 text-right font-display text-[14px] font-bold tabular-nums text-emerald-300">
                        +{formatAmount(d.amount)}
                      </td>
                      <td className="px-4 py-3.5">
                        {d.txReference ? (
                          <CopyField value={d.txReference} display={shortAddress(d.txReference, 10, 8)} className="max-w-[200px] px-2.5 py-1.5 text-[11px]" />
                        ) : (
                          <span className="font-mono text-[11px] text-zinc-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5"><StatusPill status={d.status} /></td>
                      <td className="px-5 py-3.5 text-right">
                        {d.status === "pending" ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => openReview({ kind: "deposit", id: d.id, summary: `${formatAmount(d.amount, "USDT")} · ${d.userEmail} · ${d.network} ` })}
                          >
                            Review
                          </Button>
                        ) : (
                          <span className="text-[11px] text-zinc-600" title={d.reviewNote ?? ""}>
                            {d.reviewNote ? shortAddress(d.reviewNote, 12, 0) : "resolved"}
                          </span>
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
        ) : (
          <EmptyState icon={Landmark} title="No deposit requests" description="Deposit review queues appear here." />
        )}
      </Panel>
    </div>
  );
}

function WithdrawalsTab({ openReview }: { openReview: (t: ReviewTarget) => void }) {
  const fetcher = useCallback((p: { page: number; limit: number; status?: RequestStatus }) => adminApi.withdrawals(p), []);
  const { data, loading, error, page, status, setPage, setStatus, load } = useReviewQueue<AdminWithdrawalRow>(fetcher);

  useEffect(() => {
    const handler = () => void load();
    window.addEventListener("fw:reviewed", handler);
    return () => window.removeEventListener("fw:reviewed", handler);
  }, [load]);

  return (
    <div className="space-y-4">
      <StatusFilter value={status} onChange={setStatus} />
      <Panel loading={loading} error={error} onRetry={() => void load()} skeletons={4}>
        {data && data.items.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-left">
                <thead>
                  <tr className="border-b border-white/[0.06] text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    <th className="px-5 py-3.5">Created</th>
                    <th className="px-4 py-3.5">User</th>
                    <th className="px-4 py-3.5">Network</th>
                    <th className="px-4 py-3.5">Transfer code</th>
                    <th className="px-4 py-3.5 text-right">Amount + fee</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">Review</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.045]">
                  {data.items.map((w) => (
                    <tr key={w.id} className="transition hover:bg-white/[0.02]">
                      <td className="px-5 py-3.5 text-[12.5px] text-zinc-400">{formatDateTime(w.createdAt)}</td>
                      <td className="px-4 py-3.5 text-[13px] text-zinc-300">{w.userEmail}</td>
                      <td className="px-4 py-3.5"><NetworkBadge network={w.network} /></td>
                      <td className="px-4 py-3.5">
                        {w.transferCode ? (
                          <span className="rounded-lg bg-emerald-400/10 px-2 py-1 font-mono text-[11px] font-bold tracking-wider text-emerald-200 ring-1 ring-inset ring-emerald-300/20">
                            {w.transferCode}
                          </span>
                        ) : null}
                        <span className="mt-1 block font-mono text-[10.5px] text-zinc-500" title={w.destinationAddress ?? ""}>
                          {w.destinationAddress ? shortAddress(w.destinationAddress, 8, 6) : "code payout"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right font-display text-[13.5px] font-bold tabular-nums text-rose-300">
                        −{formatAmount(String(Number(w.amount) + Number(w.fee)))}
                      </td>
                      <td className="px-4 py-3.5"><StatusPill status={w.status} /></td>
                      <td className="px-5 py-3.5 text-right">
                        {w.status === "pending" ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => openReview({ kind: "withdrawal", id: w.id, summary: `${formatAmount(w.amount, "USDT")} + fee · ${w.userEmail} · ${w.network} ` })}
                          >
                            Review
                          </Button>
                        ) : (
                          <span className="text-[11px] text-zinc-600" title={w.reviewNote ?? ""}>
                            {w.reviewNote ? shortAddress(w.reviewNote, 12, 0) : "resolved"}
                          </span>
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
        ) : (
          <EmptyState icon={WalletCards} title="No withdrawal requests" description="Withdrawal review queues appear here." />
        )}
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ audits */

function AuditsTab() {
  const [data, setData] = useState<Paginated<AuditLogRow> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await adminApi.auditLogs({ page, limit: PAGE_SIZE }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Panel loading={loading} error={error} onRetry={() => void load()} skeletons={6}>
      {data && data.items.length > 0 ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left">
              <thead>
                <tr className="border-b border-white/[0.06] text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                  <th className="px-5 py-3.5">Time</th>
                  <th className="px-4 py-3.5">Actor</th>
                  <th className="px-4 py-3.5">Action</th>
                  <th className="px-4 py-3.5">Target</th>
                  <th className="px-5 py-3.5">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.045]">
                {data.items.map((log) => (
                  <tr key={log.id} className="transition hover:bg-white/[0.02]">
                    <td className="px-5 py-3.5 text-[12.5px] text-zinc-400">{formatDateTime(log.createdAt)}</td>
                    <td className="px-4 py-3.5 text-[12.5px] text-zinc-300">{log.actorEmail ?? "system"}</td>
                    <td className="px-4 py-3.5">
                      <span className="rounded-lg bg-white/[0.06] px-2 py-1 font-mono text-[11px] text-emerald-200/90 ring-1 ring-white/10">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[11px] text-zinc-500">
                      {log.targetType ? `${log.targetType}:${log.targetId ? shortAddress(log.targetId, 6, 4) : "—"}` : "—"}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="block max-w-[280px] truncate font-mono text-[10.5px] text-zinc-600" title={JSON.stringify(log.metadata ?? {})}>
                        {log.metadata ? JSON.stringify(log.metadata) : "—"}
                      </span>
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
      ) : (
        <EmptyState icon={FileClock} title="No audit entries yet" description="Administrative and security events are recorded here." />
      )}
    </Panel>
  );
}

/* -------------------------------------------------------------------- page */

export default function AdminPage() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<TabId>("overview");
  const [review, setReview] = useState<ReviewTarget | null>(null);
  const [identity, setIdentity] = useState<AdminIdentity | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    void adminApi
      .me()
      .then(setIdentity)
      .catch(() => setIdentity(null));
  }, [isAdmin]);

  const can = (permission: string) => identity?.permissions.includes(permission) ?? false;
  const visibleTabs = TABS.filter((t) => can(t.permission));

  useEffect(() => {
    if (identity && visibleTabs.length > 0 && !visibleTabs.some((t) => t.id === tab)) {
      setTab(visibleTabs[0]!.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity]);

  if (!isAdmin) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="max-w-md rounded-3xl border border-rose-400/25 bg-rose-400/[0.06] p-8 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-rose-300" />
          <h1 className="mt-4 font-display text-[20px] font-bold text-zinc-50">Administrators only</h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-zinc-400">
            This area is restricted by role-based authorization. Every admin endpoint is independently enforced on the
            server — not just hidden in the interface.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.24em] text-amber-300/90">
            <ShieldCheck className="h-3.5 w-3.5" /> Administration
          </p>
          <h1 className="mt-1.5 font-display text-[28px] font-bold tracking-tight sm:text-[32px]">Control panel</h1>
        </div>
        <div className="text-right">
          {identity ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/10 px-2.5 py-1 text-[11.5px] font-semibold text-amber-200 ring-1 ring-inset ring-amber-300/25">
              <ShieldCheck className="h-3 w-3" /> {identity.roleLabel}
            </span>
          ) : null}
          <p className="mt-1.5 max-w-sm text-[12px] leading-relaxed text-zinc-500">
            Every action is permission-checked server-side and written to the audit log.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 rounded-2xl border border-white/[0.07] bg-ink-850/60 p-1.5 backdrop-blur-sm">
        {visibleTabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-medium transition",
              tab === id ? "bg-emerald-400/15 text-emerald-200 ring-1 ring-emerald-300/25" : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" ? <OverviewTab /> : null}
      {tab === "approvals" ? <ApprovalsTab openReview={setReview} /> : null}
      {tab === "adjustments" ? <AdjustmentsTab canApprove={can("wallet.adjust.approve")} /> : null}
      {tab === "users" ? <UsersTab canAddFunds={can("wallet.adjust")} /> : null}
      {tab === "deposits" ? <DepositsTab openReview={setReview} /> : null}
      {tab === "withdrawals" ? <WithdrawalsTab openReview={setReview} /> : null}
      {tab === "ledger" ? <LedgerTab canExport={can("ledger.export")} /> : null}
      {tab === "settings" ? <SettingsTab canManage={can("settings.manage")} /> : null}
      {tab === "security" ? <SecurityTab canManage={can("security.manage")} /> : null}
      {tab === "audits" ? <AuditsTab /> : null}

      <ReviewDialog
        open={Boolean(review)}
        onClose={() => setReview(null)}
        target={review}
        onReviewed={() => window.dispatchEvent(new Event("fw:reviewed"))}
      />
    </div>
  );
}
