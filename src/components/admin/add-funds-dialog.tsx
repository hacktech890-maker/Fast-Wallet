"use client";

import { useRef, useState } from "react";
import { PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { adminApi } from "@/lib/api/admin.api";
import { ApiClientError, newIdempotencyKey } from "@/lib/api/client";
import { useToast } from "@/contexts/toast-context";
import { formatAmount } from "@/lib/format";
import type { AdminUserRow } from "@/lib/types";

interface Props {
  user: AdminUserRow | null;
  onClose: () => void;
  /** Called after the credit was applied (or queued for approval) so lists can refresh. */
  onDone: () => void;
}

/**
 * Quick "Add funds" action for the Users tab: type an amount, confirm, and the
 * user's wallet is credited immediately. It uses the same server path as the
 * full "Wallet adjustments" form (single DB transaction, immutable ledger row,
 * audit entry, user notification, idempotency key), with sensible defaults:
 * reason "other" and funding source "not_cash_backed".
 */
export function AddFundsDialog({ user, onClose, onDone }: Props) {
  return (
    <Modal open={user !== null} onClose={onClose} title="Add funds to wallet">
      {/* keyed by user so each target gets fresh state and a fresh idempotency key */}
      {user ? <Body key={user.id} user={user} onClose={onClose} onDone={onDone} /> : null}
    </Modal>
  );
}

function Body({ user, onClose, onDone }: { user: AdminUserRow; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One key per dialog session: a retry after a network error can never double-credit.
  const idemKey = useRef(newIdempotencyKey());

  const valid = /^\d+(\.\d{1,8})?$/.test(amount.trim()) && Number(amount) > 0;
  const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email;

  const submit = async () => {
    if (!valid) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await adminApi.createAdjustment({
        userId: user.id,
        type: "credit",
        amount: amount.trim(),
        currency: "USDT",
        reason: "other",
        note: note.trim() || undefined,
        fundingSource: "not_cash_backed",
        idempotencyKey: idemKey.current,
      });
      if (res.pendingApproval) {
        toast.info("Awaiting second approval", "This high-value credit needs another administrator to approve it before it reaches the wallet.");
      } else {
        toast.success(
          `Added ${formatAmount(amount.trim(), "USDT")} to ${name}`,
          `New balance: ${formatAmount(res.balanceAfter ?? "0", "USDT")}. The user has been notified.`,
        );
      }
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Could not add funds. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3">
        <p className="text-[13px] font-semibold text-zinc-100">{name}</p>
        <p className="text-[12px] text-zinc-500">{user.email}</p>
        <p className="mt-1.5 text-[12px] text-zinc-400">
          Current balance: <span className="font-semibold tabular-nums text-zinc-200">{formatAmount(user.available, "USDT")}</span>
        </p>
      </div>

      <label className="block space-y-1.5">
        <span className="text-[13px] font-medium text-zinc-300">Amount (USDT)</span>
        <TextInput
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="8.00"
          inputMode="decimal"
          autoComplete="off"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-[13px] font-medium text-zinc-300">Note (optional, for the audit log)</span>
        <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Welcome bonus" maxLength={1000} />
      </label>

      {error ? (
        <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-3.5 py-2.5 text-[13px] text-rose-100">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button loading={submitting} disabled={!valid} onClick={() => void submit()}>
          <PlusCircle className="h-4 w-4" />
          {valid ? `Add ${formatAmount(amount.trim(), "USDT")}` : "Add funds"}
        </Button>
      </div>
    </div>
  );
}
