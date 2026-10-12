"use client";

import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { QRCodeSVG } from "qrcode.react";
import { ArrowDownToLine, BadgeCheck, Landmark, TriangleAlert } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import { CopyField } from "@/components/ui/copy-field";
import { StatusPill } from "@/components/ui/status-pill";
import { depositsApi } from "@/lib/api/deposits.api";
import { ApiClientError, newIdempotencyKey } from "@/lib/api/client";
import { depositFormSchema, type DepositFormValues } from "@/lib/schemas";
import { useToast } from "@/contexts/toast-context";
import { formatAmount } from "@/lib/format";
import type { DepositRequest, Network } from "@/lib/types";

interface DepositModalProps {
  open: boolean;
  onClose: () => void;
  addresses: Record<Network, string>;
  minDeposit: string;
  onCreated?: () => void;
}

/** Lazily mint one idempotency key per mounted session — refs are only
 *  touched inside event handlers, never during render. */
function useLazyIdemKey() {
  const ref = useRef<string | null>(null);
  return () => (ref.current ??= newIdempotencyKey());
}

export function DepositModal({ open, onClose, addresses, minDeposit, onCreated }: DepositModalProps) {
  const toast = useToast();
  // Fresh key & clean state are guaranteed by the key-based remount on open.
  const getIdemKey = useLazyIdemKey();
  const [created, setCreated] = useState<DepositRequest | null>(null);
  const [rootError, setRootError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<DepositFormValues>({
    resolver: zodResolver(depositFormSchema),
    defaultValues: { network: "BEP20", amount: "", txReference: "" },
  });

  const address = addresses.BEP20;
  const addressConfigured = address && !address.startsWith("Not configured");

  const onSubmit = handleSubmit(async (values) => {
    setRootError(null);
    try {
      const res = await depositsApi.create({
        network: "BEP20",
        amount: values.amount,
        txReference: values.txReference,
        idempotencyKey: getIdemKey(),
      });
      setCreated(res.request);
      toast.success("Deposit submitted", "An administrator will verify your transaction hash and credit your wallet.");
      onCreated?.();
    } catch (e) {
      if (e instanceof ApiClientError) {
        if (e.code === "DUPLICATE_TX_HASH") {
          setRootError(e.message);
        } else {
          setRootError(e.status === 422 ? e.fieldError("txReference") ?? e.fieldError("amount") ?? e.message : e.message);
        }
      } else setRootError("Something went wrong. Please try again.");
    }
  });

  const amount = watch("amount") ?? "";

  /** Reset the review-success state whenever the modal closes. */
  const handleClose = () => {
    setCreated(null);
    setRootError(null);
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Deposit USDT" subtitle="Send, paste the hash, get credited after verification" wide>
      {created ? (
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-400/10 ring-1 ring-emerald-300/30">
            <BadgeCheck className="h-8 w-8 text-emerald-300" />
          </div>
          <div>
            <h3 className="font-display text-lg font-semibold text-zinc-50">Deposit under review</h3>
            <p className="mt-1 max-w-sm text-[13.5px] leading-relaxed text-zinc-400">
              Your deposit of <span className="font-semibold text-zinc-100">{formatAmount(created.amount, "USDT")}</span> is{" "}
              <StatusPill status={created.status} className="mx-1" />. An administrator will verify your transaction
              hash on-chain and credit your wallet — balances never update before verification.
            </p>
          </div>
          <div className="w-full rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 text-left">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Submitted transaction hash</p>
            <p className="mt-1.5 break-all font-mono text-[12.5px] text-zinc-300">{created.txReference}</p>
            <p className="mt-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Request reference</p>
            <p className="mt-1 break-all font-mono text-[12.5px] text-zinc-300">{created.id}</p>
          </div>
          <Button onClick={handleClose} className="w-full" size="lg">
            Done
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5">
          {/* Network — BEP20 only */}
          <Field label="Network">
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-300/50 bg-emerald-400/[0.08] p-3.5 shadow-[0_0_0_1px_rgba(52,211,153,0.25)]">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-300/15 text-sm font-black text-amber-300 ring-1 ring-inset ring-amber-300/30">
                B
              </span>
              <span>
                <span className="block text-[13.5px] font-bold text-zinc-100">BEP20</span>
                <span className="block text-[11px] text-zinc-500">BNB Smart Chain</span>
              </span>
              <span className="ml-auto rounded-md bg-emerald-400/15 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-300/25">
                Selected
              </span>
            </div>
          </Field>

          {/* Deposit address */}
          {addressConfigured ? (
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
              <div className="flex items-start gap-4">
                <div className="shrink-0 rounded-2xl bg-white p-2.5 shadow-lg">
                  <QRCodeSVG value={address} size={108} level="M" />
                </div>
                <div className="min-w-0 flex-1 space-y-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    Official BEP20 deposit address
                  </p>
                  <CopyField value={address} />
                  <p className="flex items-start gap-1.5 text-[12px] leading-snug text-amber-200/80">
                    <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Send only USDT via BEP20 to this address. Transfers on other networks cannot be recovered.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <p className="flex items-center gap-2 rounded-xl border border-amber-300/25 bg-amber-400/[0.06] px-3.5 py-3 text-[12.5px] text-amber-200">
              <TriangleAlert className="h-4 w-4 shrink-0" />
              The deposit address is not configured — please contact support.
            </p>
          )}

          {/* Transaction hash — required, globally unique */}
          <Field
            label="Transaction hash"
            error={errors.txReference?.message}
            hint="From your wallet/explorer — 0x + 64 characters. Each hash can be claimed once."
            htmlFor="dep-tx"
          >
            <TextInput
              id="dep-tx"
              placeholder="0x…"
              invalid={Boolean(errors.txReference)}
              autoComplete="off"
              spellCheck={false}
              className="font-mono text-[12.5px]"
              {...register("txReference")}
            />
          </Field>

          {/* Amount */}
          <Field label="Amount deposited (USDT)" error={errors.amount?.message} hint={`Minimum ${minDeposit} USDT`} htmlFor="dep-amount">
            <TextInput
              id="dep-amount"
              inputMode="decimal"
              placeholder="20.00"
              icon={<ArrowDownToLine className="h-4 w-4" />}
              invalid={Boolean(errors.amount)}
              {...register("amount")}
            />
          </Field>

          {rootError ? (
            <p className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-3.5 py-2.5 text-[13px] font-medium text-rose-200">
              {rootError}
            </p>
          ) : null}

          <Button type="submit" size="lg" loading={isSubmitting} disabled={!addressConfigured} className="w-full">
            <Landmark className="h-4 w-4" />
            {Number(amount) > 0 ? `I deposited ${formatAmount(amount, "USDT")} — notify admin` : "Confirm amount deposited"}
          </Button>
          <p className="text-center text-[11.5px] leading-relaxed text-zinc-600">
            Submitting forms a review request. Crediting happens only after an administrator verifies the hash —
            duplicate hashes are rejected automatically.
          </p>
        </form>
      )}
    </Modal>
  );
}
