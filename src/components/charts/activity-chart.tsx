"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface ActivityPoint {
  date: string;
  inflow: number;
  outflow: number;
}

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { dataKey?: string; value?: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-ink-800/95 px-3.5 py-2.5 shadow-xl backdrop-blur-xl">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="mt-1 text-[13px] tabular-nums text-zinc-200">
          <span className={p.dataKey === "inflow" ? "text-emerald-300" : "text-rose-300"}>
            {p.dataKey === "inflow" ? "Inflow" : "Outflow"}:
          </span>{" "}
          {full.format(Number(p.value ?? 0))} USDT
        </p>
      ))}
    </div>
  );
}

export function ActivityChart({ data }: { data: ActivityPoint[] }) {
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="inflowGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34d399" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="outflowGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fb7185" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#fb7185" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: "#71717a", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            minTickGap={28}
          />
          <YAxis
            tick={{ fill: "#71717a", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => compact.format(v)}
            width={44}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: "rgba(255,255,255,0.15)" }} />
          <Area type="monotone" dataKey="inflow" stroke="#34d399" strokeWidth={2.2} fill="url(#inflowGrad)" />
          <Area type="monotone" dataKey="outflow" stroke="#fb7185" strokeWidth={2} fill="url(#outflowGrad)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
