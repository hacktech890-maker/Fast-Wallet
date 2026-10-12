import type { ReactNode } from "react";
import { ShieldCheck, Lock, Zap } from "lucide-react";
import { Logo } from "@/components/layout/app-shell";
import { AuthVisual } from "./auth-visual";

const PROOF_POINTS = [
  { icon: Lock, label: "Secure sessions", sub: "bcrypt + expiring cookies" },
  { icon: Zap, label: "Verified deposits", sub: "Webhook-confirmed only" },
  { icon: ShieldCheck, label: "Atomic ledger", sub: "Decimal math, no floats" },
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh bg-ink-950 text-zinc-100">
      {/* Brand panel */}
      <div className="relative hidden w-[46%] overflow-hidden lg:block">
        {/* Gradient fallback shows under/beside the image; if the asset is ever
            missing the panel stays on-brand instead of a 404'd blank. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 30% 30%, rgba(16,185,129,0.22), transparent 45%), radial-gradient(circle at 70% 65%, rgba(20,184,166,0.16), transparent 50%), linear-gradient(160deg,#040a10,#07111c 55%,#04070c)",
          }}
        />
        <AuthVisual />
        <div className="absolute inset-0 bg-gradient-to-r from-ink-950/40 via-ink-950/70 to-ink-950" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-transparent to-ink-950/60" />

        <div className="relative z-10 flex h-full flex-col justify-between p-10 xl:p-14">
          <Logo />
          <div className="max-w-md">
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-emerald-300">Fast Wallet</p>
            <h1 className="mt-4 font-display text-[42px] font-bold leading-[1.05] tracking-tight xl:text-[52px]">
              Money that moves
              <br />
              <span className="bg-gradient-to-r from-emerald-300 to-teal-200 bg-clip-text text-transparent">
                at the speed of trust.
              </span>
            </h1>
            <p className="mt-5 text-[15px] leading-relaxed text-zinc-400">
              Top up by card or crypto, track every movement in a tamper-evident ledger, and withdraw with
              administrative-grade controls — Fast Wallet keeps your balance exact, always.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {PROOF_POINTS.map(({ icon: Icon, label, sub }) => (
              <div key={label} className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4 backdrop-blur-md">
                <Icon className="h-4.5 w-4.5 text-emerald-300" strokeWidth={2} />
                <p className="mt-2.5 text-[12.5px] font-semibold text-zinc-100">{label}</p>
                <p className="mt-0.5 text-[11px] text-zinc-500">{sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Content panel */}
      <div className="relative flex flex-1 items-center justify-center px-4 py-12 sm:px-8">
        <div className="pointer-events-none absolute inset-0 lg:hidden">
          <div className="absolute -top-24 right-0 h-72 w-72 rounded-full bg-emerald-500/[0.08] blur-[100px]" />
        </div>
        <div className="relative w-full max-w-[420px]">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
