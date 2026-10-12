"use client";

import { useCallback, useEffect, useState } from "react";
import { Save, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { adminApi } from "@/lib/api/admin.api";
import { ApiClientError } from "@/lib/api/client";
import { useToast } from "@/contexts/toast-context";
import { cn } from "@/lib/utils";
import type { PlatformSettings } from "@/lib/types";

type Key = keyof PlatformSettings;

const GROUPS: { title: string; hint: string; fields: { key: Key; label: string; hint?: string; kind: "amount" | "toggle" | "text" | "number" }[] }[] = [
  {
    title: "Deposits",
    hint: "There is no hardcoded minimum — set any floor you need (e.g. 1.00).",
    fields: [
      { key: "depositsEnabled", label: "Deposits enabled", kind: "toggle" },
      { key: "cardDepositsEnabled", label: "Card deposits enabled", kind: "toggle" },
      { key: "minDeposit", label: "Minimum deposit", hint: "Card payments still cannot go below the provider floor (0.50 USD)", kind: "amount" },
      { key: "maxDeposit", label: "Maximum deposit", kind: "amount" },
      { key: "dailyDepositLimit", label: "Daily deposit limit per user", hint: "0 = unlimited", kind: "amount" },
      { key: "depositMaintenanceMessage", label: "Deposit maintenance message", kind: "text" },
    ],
  },
  {
    title: "Withdrawals",
    hint: "Fees and limits apply to every new transfer request.",
    fields: [
      { key: "withdrawalsEnabled", label: "Withdrawals enabled", kind: "toggle" },
      { key: "networkBep20Enabled", label: "BEP20 network enabled", kind: "toggle" },
      { key: "minWithdrawal", label: "Minimum transfer", kind: "amount" },
      { key: "maxWithdrawal", label: "Maximum transfer", kind: "amount" },
      { key: "withdrawalFee", label: "Network fee", kind: "amount" },
      { key: "dailyWithdrawalLimit", label: "Daily transfer limit per user", hint: "0 = unlimited", kind: "amount" },
      { key: "withdrawalMaintenanceMessage", label: "Withdrawal maintenance message", kind: "text" },
    ],
  },
  {
    title: "Risk & approvals",
    hint: "Controls dual approval and negative-balance policy.",
    fields: [
      { key: "dualApprovalEnabled", label: "Require dual approval for high-value adjustments", kind: "toggle" },
      { key: "highValueAdjustmentThreshold", label: "High-value threshold", kind: "amount" },
      { key: "allowNegativeBalance", label: "Allow negative balances (documented policy only)", kind: "toggle" },
      { key: "failedLoginAlertThreshold", label: "Failed logins before an alert", kind: "number" },
    ],
  },
  {
    title: "Notifications",
    hint: "In-app notifications sent to affected users.",
    fields: [
      { key: "notifyOnAdjustment", label: "Notify on wallet adjustments", kind: "toggle" },
      { key: "notifyOnDeposit", label: "Notify on deposit decisions", kind: "toggle" },
      { key: "notifyOnWithdrawal", label: "Notify on withdrawal decisions", kind: "toggle" },
    ],
  },
];

export function SettingsTab({ canManage }: { canManage: boolean }) {
  const toast = useToast();
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [draft, setDraft] = useState<Partial<PlatformSettings>>({});
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await adminApi.settings();
    setSettings(res.settings);
    setDraft({});
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dirtyKeys = Object.keys(draft) as Key[];
  const value = <K extends Key>(key: K): PlatformSettings[K] => (draft[key] ?? settings![key]) as PlatformSettings[K];
  const setValue = (key: Key, v: string | boolean | number) => setDraft((d) => ({ ...d, [key]: v }));

  const save = async () => {
    if (!reason.trim()) {
      setError("Describe why this change is being made — it is recorded in the audit log.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await adminApi.updateSettings(draft, reason.trim());
      setSettings(res.settings);
      setDraft({});
      setReason("");
      toast.success(
        res.changes.length ? `${res.changes.length} setting(s) updated` : "No changes detected",
        res.changes.map((c) => `${c.key}: ${String(c.previous)} → ${String(c.next)}`).join(" · ") || undefined,
      );
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Could not save settings");
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-64" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-2xl border border-sky-300/20 bg-sky-400/[0.06] p-4">
        <SlidersHorizontal className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
        <p className="text-[12.5px] leading-relaxed text-sky-100/80">
          Operational policy is stored in the database and applies to the API and UI simultaneously. Secrets (payment
          keys, session secret) live only in environment variables and are never shown or editable here.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {GROUPS.map((group) => (
          <section key={group.title} className="rounded-2xl border border-white/[0.07] bg-ink-850/60 p-5 backdrop-blur-sm">
            <h3 className="font-display text-[15px] font-semibold">{group.title}</h3>
            <p className="mb-4 text-[12px] text-zinc-500">{group.hint}</p>
            <div className="space-y-3.5">
              {group.fields.map((f) => {
                const current = value(f.key);
                const dirty = f.key in draft;
                if (f.kind === "toggle") {
                  return (
                    <label
                      key={f.key}
                      className={cn(
                        "flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 transition",
                        dirty ? "border-emerald-300/40 bg-emerald-400/[0.06]" : "border-white/10 bg-white/[0.02]",
                      )}
                    >
                      <span className="text-[13px] text-zinc-200">{f.label}</span>
                      <input
                        type="checkbox"
                        disabled={!canManage}
                        checked={Boolean(current)}
                        onChange={(e) => setValue(f.key, e.target.checked)}
                        className="h-4 w-4 cursor-pointer accent-emerald-400"
                      />
                    </label>
                  );
                }
                return (
                  <Field key={f.key} label={f.label} hint={f.hint}>
                    <TextInput
                      value={String(current)}
                      disabled={!canManage}
                      inputMode={f.kind === "amount" || f.kind === "number" ? "decimal" : undefined}
                      onChange={(e) => setValue(f.key, f.kind === "number" ? Number(e.target.value) : e.target.value)}
                      className={cn(dirty && "border-emerald-300/50")}
                    />
                  </Field>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {canManage ? (
        <div className="sticky bottom-4 rounded-2xl border border-white/10 bg-ink-800/95 p-4 shadow-2xl backdrop-blur-xl">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-1">
              <Field label="Reason for this change" error={error ?? undefined}>
                <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. lowering minimum deposit for launch promo" />
              </Field>
            </div>
            <Button onClick={() => void save()} loading={saving} disabled={dirtyKeys.length === 0}>
              <Save className="h-4 w-4" />
              Save {dirtyKeys.length > 0 ? `${dirtyKeys.length} change${dirtyKeys.length === 1 ? "" : "s"}` : "changes"}
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-center text-[12px] text-zinc-500">Your role can view settings but not modify them.</p>
      )}
    </div>
  );
}
