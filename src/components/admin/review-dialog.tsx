"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { adminApi } from "@/lib/api/admin.api";
import { ApiClientError } from "@/lib/api/client";
import { useToast } from "@/contexts/toast-context";

export interface ReviewTarget {
  kind: "deposit" | "withdrawal";
  id: string;
  summary: string;
}

interface ReviewDialogProps {
  open: boolean;
  onClose: () => void;
  target: ReviewTarget | null;
  onReviewed: () => void;
}

export function ReviewDialog({ open, onClose, target, onReviewed }: ReviewDialogProps) {
  const toast = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  useEffect(() => {
    if (open) {
      setNote("");
      setBusy(null);
    }
  }, [open]);

  const act = async (action: "approve" | "reject") => {
    if (!target) return;
    setBusy(action);
    try {
      if (target.kind === "deposit") await adminApi.reviewDeposit(target.id, { action, note: note || undefined });
      else await adminApi.reviewWithdrawal(target.id, { action, note: note || undefined });
      toast.success(
        action === "approve" ? "Request approved" : "Request rejected",
        action === "approve"
          ? target.kind === "deposit"
            ? "The simulated balance was credited."
            : "The reserved funds were released from the wallet."
          : target.kind === "withdrawal"
            ? "Reserved funds were restored to the user's available balance."
            : "The request was closed without crediting funds.",
      );
      onReviewed();
      onClose();
    } catch (e) {
      toast.error("Review failed", e instanceof ApiClientError ? e.message : "Unexpected error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Review request" subtitle={target?.summary ?? ""}>
      <div className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-[13px] font-medium text-zinc-300">
            Review note <span className="text-[11px] font-normal text-zinc-500">optional, recorded in the audit log</span>
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="e.g. verified against payment reference"
            className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-[14px] text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-300/60 focus:outline-none"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Button onClick={() => void act("approve")} loading={busy === "approve"} disabled={busy !== null} size="lg">
            <Check className="h-4 w-4" />
            Approve
          </Button>
          <Button variant="danger" onClick={() => void act("reject")} loading={busy === "reject"} disabled={busy !== null} size="lg">
            <X className="h-4 w-4" />
            Reject
          </Button>
        </div>
        <p className="text-center text-[12px] text-zinc-500">
          The transition is atomic — concurrent reviews resolve to exactly one outcome and are audit-logged.
        </p>
      </div>
    </Modal>
  );
}
