"use client";

import { useCallback, useEffect, useState } from "react";
import { RadarIcon, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectInput } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { adminApi } from "@/lib/api/admin.api";
import { ApiClientError } from "@/lib/api/client";
import { useToast } from "@/contexts/toast-context";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Paginated, SecurityAlertRow } from "@/lib/types";

const SEVERITY: Record<string, string> = {
  low: "bg-zinc-400/10 text-zinc-300 ring-zinc-400/20",
  medium: "bg-amber-400/10 text-amber-200 ring-amber-300/25",
  high: "bg-orange-400/10 text-orange-200 ring-orange-300/25",
  critical: "bg-rose-400/10 text-rose-200 ring-rose-300/25",
};

export function SecurityTab({ canManage }: { canManage: boolean }) {
  const toast = useToast();
  const [data, setData] = useState<Paginated<SecurityAlertRow> | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [scanning, setScanning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await adminApi.alerts({ page, limit: 20, status: status || undefined }));
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const scan = async () => {
    setScanning(true);
    try {
      const res = await adminApi.scanAlerts();
      toast.success(res.created > 0 ? `${res.created} new alert(s) raised` : "No new anomalies detected");
      void load();
    } catch (e) {
      toast.error("Scan failed", e instanceof ApiClientError ? e.message : undefined);
    } finally {
      setScanning(false);
    }
  };

  const setAlertStatus = async (alert: SecurityAlertRow, next: "investigating" | "resolved") => {
    try {
      await adminApi.resolveAlert(alert.id, { status: next });
      toast.success(next === "resolved" ? "Alert resolved" : "Alert marked as investigating");
      void load();
    } catch (e) {
      toast.error("Could not update alert", e instanceof ApiClientError ? e.message : undefined);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-ink-850/60 p-4 backdrop-blur-sm">
        <p className="max-w-xl text-[12.5px] leading-relaxed text-zinc-500">
          Detection raises alerts for human review only — it never freezes funds or bans accounts automatically.
          Thresholds are configurable in Settings.
        </p>
        <div className="flex items-center gap-2.5">
          <SelectInput value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="h-9 max-w-[170px] text-[12.5px]">
            <option value="">All alerts</option>
            <option value="open">Open</option>
            <option value="investigating">Investigating</option>
            <option value="resolved">Resolved</option>
          </SelectInput>
          {canManage ? (
            <Button size="sm" variant="secondary" onClick={() => void scan()} loading={scanning}>
              <RadarIcon className="h-3.5 w-3.5" /> Run scan
            </Button>
          ) : null}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-ink-850/60 backdrop-blur-sm">
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : !data || data.items.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="No alerts" description="Run a scan to check for failed logins, duplicate references and other anomalies." />
        ) : (
          <>
            <ul className="divide-y divide-white/[0.045]">
              {data.items.map((alert) => (
                <li key={alert.id} className="flex flex-wrap items-start gap-3 px-4 py-3.5">
                  <span className={cn("shrink-0 rounded-md px-2 py-1 text-[10.5px] font-bold uppercase tracking-wide ring-1 ring-inset", SEVERITY[alert.severity])}>
                    {alert.severity}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-semibold text-zinc-100">{alert.summary}</p>
                    <p className="text-[11.5px] text-zinc-500">
                      {alert.type.replace(/_/g, " ")} · {formatDateTime(alert.createdAt)}
                      {alert.userEmail ? ` · ${alert.userEmail}` : ""}
                    </p>
                    {alert.details ? (
                      <p className="mt-0.5 truncate font-mono text-[10.5px] text-zinc-600">{JSON.stringify(alert.details)}</p>
                    ) : null}
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-1 text-[10.5px] font-semibold ring-1 ring-inset",
                      alert.status === "resolved"
                        ? "bg-emerald-400/10 text-emerald-200 ring-emerald-300/25"
                        : alert.status === "investigating"
                          ? "bg-sky-400/10 text-sky-200 ring-sky-300/25"
                          : "bg-amber-400/10 text-amber-200 ring-amber-300/25",
                    )}
                  >
                    {alert.status}
                  </span>
                  {canManage && alert.status !== "resolved" ? (
                    <div className="flex shrink-0 gap-2">
                      {alert.status === "open" ? (
                        <Button size="sm" variant="secondary" onClick={() => void setAlertStatus(alert, "investigating")}>
                          Investigate
                        </Button>
                      ) : null}
                      <Button size="sm" onClick={() => void setAlertStatus(alert, "resolved")}>
                        Resolve
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="border-t border-white/[0.06] px-4 py-3.5">
              <Pagination page={data.page} limit={data.limit} total={data.total} onPage={setPage} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
