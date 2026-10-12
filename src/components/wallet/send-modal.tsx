"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowUpFromLine, BadgeCheck, ShieldCheck, Ticket } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import { CopyField } from "@/components/ui/copy-field";
import { StatusPill } from "@/components/ui/status-pill";
import { withdrawalsApi } from "@/lib/api/withdrawals.api";
import { ApiClientError, newIdempotencyKey } from "@/lib/api/client";
import { withdrawalFormSchema, type WithdrawalFormValues } from "@/lib/schemas";
import { useToast } from "@/contexts/toast-context";
import { formatAmount } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { WithdrawalRequest } from "@/lib/types";

interface SendModalProps {
  open: boolean;
  onClose: () => void;
  available: string;
  fee: string;
  minWithdrawal: string;
  onCreated?: () => void;
}

/** Quick-select transfer amounts (USDT). */
const PRESETS = ["5", "10", "15", "50", "100", "200", "300"] as const;

function useLazyIdemKey() {
  const ref = useRef<string | null>(null);
  return () => (ref.current ??= newIdempotencyKey());
}

export function SendModal({ open, onClose, available, fee, minWithdrawal, onCreated }: SendModalProps) {
  const toast = useToast();
  const getIdemKey = useLazyIdemKey();
  const [created, setCreated] = useState<WithdrawalRequest | null>(null);
  const [rootError, setRootError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<WithdrawalFormValues>({
    resolver: zodResolver(withdrawalFormSchema),
    defaultValues: { network: "BEP20", destinationAddress: "", amount: "" },
  });

  const amount = watch("amount") ?? "";
  const availableNum = Number(available);
  const feeNum = Number(fee);
  const amountNum = /^\d+(\.\d{1,8})?$/.test(amount.trim()) ? Number(amount) : 0;
  const totalNum = amountNum + feeNum;
  const exceeds = amountNum > 0 && totalNum > availableNum;

  const handleClose = () => {
    setCreated(null);
    setRootError(null);
    onClose();
  };

  const setMax = () => {
    const max = Math.max(0, availableNum - feeNum);
    setValue("amount", max === 0 ? "" : String(Math.floor(max * 100) / 100), { shouldValidate: true });
  };

  const onSubmit = handleSubmit(async (values) => {
    setRootError(null);
    try {
      const res = await withdrawalsApi.create({
        network: "BEP20",
        amount: values.amount,
        destinationAddress: values.destinationAddress || undefined,
        idempotencyKey: getIdemKey(),
      });
      setCreated(res.request);
      toast.success("Transfer code generated", `${formatAmount(res.request.amount, "USDT")} has been debited from your wallet.`);
      onCreated?.();
    } catch (e) {
      if (e instanceof ApiClientError) {
        setRootError(e.status === 422 ? e.fieldError("amount") ?? e.fieldError("destinationAddress") ?? e.message : e.message);
      } else setRootError("Something went wrong. Please try again.");
    }
  });

  return (
    <Modal open={open} onClose={handleClose} title="Send / Transfer" subtitle="Generate a transfer code on BNB Smart Chain" wide>
      {created ? (
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-400/10 ring-1 ring-emerald-300/30">
            <BadgeCheck className="h-8 w-8 text-emerald-300" />
          </div>
          <div>
            <h3 className="font-display text-lg font-semibold text-zinc-50">Transfer code generated</h3>
            <p className="mt-1 max-w-sm text-[13.5px] leading-relaxed text-zinc-400">
              <span className="font-semibold text-zinc-100">{formatAmount(created.amount, "USDT")}</span> plus the{" "}
              {formatAmount(created.fee)} fee has been <span className="font-semibold text-zinc-100">debited from your wallet</span>{" "}
              and the request is <StatusPill status={created.status} className="mx-1" />.
            </p>
          </div>

          {/* The generated code */}
          <div className="w-full rounded-2xl border border-emerald-300/25 bg-emerald-400/[0.07] p-5">
            <p className="flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-300">
              <Ticket className="h-3.5 w-3.5" /> Your transfer code
            </p>
            <p className="mt-2.5 font-display text-[26px] font-bold tracking-[0.12em] text-emerald-100 sm:text-[30px]">
              {created.transferCode}
            </p>
            <div className="mt-3">
              <CopyField value={created.transferCode ?? ""} />
            </div>
            <p className="mt-2.5 text-[11.5px] leading-relaxed text-emerald-100/60">
              Keep this code — it identifies your transfer during processing and review.
            </p>
          </div>

          <p className="flex items-center justify-center gap-1.5 text-[12px] text-zinc-500">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-300/70" />
            Funds are released after administrative review. Cancel while pending to get them back.
          </p>

          <div className="flex w-full gap-2.5">
            <Link href="/withdrawals" className="flex-1" onClick={handleClose}>
              <Button variant="secondary" size="lg" className="w-full">
                Track transfer
              </Button>
            </Link>
            <Button onClick={handleClose} size="lg" className="flex-1">
              Done
            </Button>
          </div>
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

          {/* Quick amounts */}
          <Field label="Transfer amount (USDT)" error={errors.amount?.message} hint={`Minimum ${minWithdrawal} USDT · Available ${formatAmount(available, "USDT")}`}>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {PRESETS.map((preset) => {
                const active = amount.trim() === preset;
                const affordable = Number(preset) + feeNum <= availableNum;
                return (
                  <button
                    key={preset}
                    type="button"
                    disabled={!affordable}
                    onClick={() => setValue("amount", preset, { shouldValidate: true })}
                    className={cn(
                      "rounded-xl border py-2.5 text-[13px] font-bold tabular-nums transition active:scale-[0.97]",
                      active
                        ? "border-emerald-300/50 bg-emerald-400/15 text-emerald-200"
                        : "border-white/10 bg-white/[0.03] text-zinc-300 hover:border-white/20 hover:bg-white/[0.06]",
                      !affordable && "cursor-not-allowed opacity-35 hover:border-white/10 hover:bg-white/[0.03]",
                    )}
                  >
                    {preset}
                  </button>
                );
              })}
            </div>
          </Field>

          {/* Custom amount */}
          <Field label="Or enter a custom amount" error={undefined} htmlFor="wd-amount">
            <div className="relative">
              <TextInput
                id="wd-amount"
                inputMode="decimal"
                placeholder="0.00"
                icon={<ArrowUpFromLine className="h-4 w-4" />}
                invalid={Boolean(errors.amount) || exceeds}
                {...register("amount")}
              />
              <button
                type="button"
                onClick={setMax}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md bg-emerald-400/15 px-2 py-1 text-[10.5px] font-bold uppercase tracking-wider text-emerald-300 transition hover:bg-emerald-400/25"
              >
                Max
              </button>
            </div>
          </Field>

          {/* Optional payout address */}
          <Field
            label="Destination address"
            error={errors.destinationAddress?.message}
            hint="BEP20 address (0x…) — leave empty to receive the payout against your transfer code"
            htmlFor="wd-address"
            optional
          >
            <TextInput
              id="wd-address"
              placeholder="0x…"
              invalid={Boolean(errors.destinationAddress)}
              autoComplete="off"
              spellCheck={false}
              className="font-mono text-[12.5px]"
              {...register("destinationAddress")}
            />
          </Field>

          <div className="space-y-2 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 text-[13px]">
            <div className="flex justify-between text-zinc-400">
              <span>Transfer amount</span>
              <span className="tabular-nums text-zinc-200">{amountNum > 0 ? formatAmount(String(amountNum), "USDT") : "—"}</span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Network fee</span>
              <span className="tabular-nums text-zinc-200">{formatAmount(fee, "USDT")}</span>
            </div>
            <div className="flex justify-between border-t border-white/[0.06] pt-2 font-semibold text-zinc-100">
              <span>Debited from wallet</span>
              <span className={cn("tabular-nums", exceeds && "text-rose-300")}>
                {amountNum > 0 ? `${formatAmount(String(totalNum))} USDT` : "—"}
              </span>
            </div>
            {exceeds ? (
              <p className="text-[12px] font-medium text-rose-300">Amount + fee exceeds your available balance.</p>
            ) : null}
          </div>

          {rootError ? (
            <p className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-3.5 py-2.5 text-[13px] font-medium text-rose-200">
              {rootError}
            </p>
          ) : null}

          <Button type="submit" size="lg" loading={isSubmitting} disabled={exceeds || amountNum <= 0} className="w-full">
            <Ticket className="h-4 w-4" />
            Generate transfer code
          </Button>
          <p className="text-center text-[11.5px] leading-relaxed text-zinc-600">
            The amount is debited immediately and held until the transfer is approved. Cancel while pending for an instant refund.
          </p>
        </form>
      )}
    </Modal>
  );
}
