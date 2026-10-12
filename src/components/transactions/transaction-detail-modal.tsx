"use client";

import { Modal } from "@/components/ui/modal";
import { StatusPill } from "@/components/ui/status-pill";
import { NetworkBadge } from "@/components/ui/network-badge";
import { CopyField } from "@/components/ui/copy-field";
import { TxIcon, TX_TYPE_LABEL } from "@/components/ui/tx-icon";
import { compactAmount, formatAmount, formatDateTime, isDebit } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Transaction } from "@/lib/types";

interface TransactionDetailModalProps {
  transaction: Transaction | null;
  onClose: () => void;
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="text-[12.5px] text-zinc-500">{label}</span>
      <span className={cn("max-w-[65%] break-all text-right text-[13px] text-zinc-200", mono && "font-mono text-[12px]")}>{value}</span>
    </div>
  );
}

export function TransactionDetailModal({ transaction, onClose }: TransactionDetailModalProps) {
  const tx = transaction;
  return (
    <Modal open={Boolean(tx)} onClose={onClose} title="Transaction details" wide>
      {tx ? (
        <div className="space-y-4">
          <div className="flex items-center gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
            <TxIcon type={tx.type} className="h-11 w-11" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-zinc-400">{TX_TYPE_LABEL[tx.type]}</p>
              <p className={cn("font-display text-2xl font-bold tabular-nums tracking-tight", isDebit(tx.amount) ? "text-rose-300" : "text-emerald-300")}>
                {isDebit(tx.amount) ? "−" : "+"}
                {formatAmount(tx.amount.replace("-", ""))}
                <span className="ml-1.5 text-sm font-semibold text-zinc-500">{tx.asset}</span>
              </p>
            </div>
            <StatusPill status={tx.status} />
          </div>

          {tx.isSimulated ? (
            <p className="rounded-xl border border-amber-300/20 bg-amber-400/[0.07] px-3.5 py-2.5 text-[12.5px] font-medium text-amber-200">
              Legacy simulated record.
            </p>
          ) : null}

          <div className="divide-y divide-white/[0.05] rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4">
            <Row label="Date" value={formatDateTime(tx.createdAt)} />
            <Row label="Network" value={<NetworkBadge network={tx.network} />} />
            <Row label="Fee" value={`${compactAmount(tx.fee)} ${tx.asset}`} />
            <Row label="Balance after" value={tx.balanceAfter ? formatAmount(tx.balanceAfter, tx.asset) : "Pending settlement"} />
            <Row label="Reference" value={tx.reference} mono />
            {tx.counterparty ? (
              <div className="py-2.5">
                <p className="mb-1.5 text-[12.5px] text-zinc-500">Counterparty / address</p>
                <CopyField value={tx.counterparty} display={tx.counterparty} />
              </div>
            ) : null}
            {tx.note ? <Row label="Note" value={tx.note} /> : null}
            <Row label="Transaction ID" value={tx.id} mono />
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
