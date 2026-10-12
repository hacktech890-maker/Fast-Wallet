import { z } from "zod";

/**
 * Centralized, validated environment configuration.
 * Parsed lazily so `next build` never crashes when optional vars are absent.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  SESSION_SECRET: z
    .string()
    .min(16)
    .default("change-me-to-a-long-random-secret-in-production"),
  COOKIE_SECURE: z.enum(["true", "false"]).optional(),
  COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(168), // 7 days
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  LOGIN_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().positive().default(10),
  WITHDRAWAL_FEE_USDT: z
    .string()
    .regex(/^\d+(\.\d{1,8})?$/)
    .default("1.00000000"),
  MIN_DEPOSIT_USDT: z.string().regex(/^\d+(\.\d{1,8})?$/).default("10"),
  MIN_WITHDRAWAL_USDT: z.string().regex(/^\d+(\.\d{1,8})?$/).default("10"),
  // Public application URL used for building checkout/reset links.
  // Set to https://fastwallet.in (or the Vercel preview URL) in deployment.
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  // Stripe payment provider — deposits are credited ONLY via the signed
  // server-side webhook. When unset, card checkout responds 503.
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_CURRENCY: z.string().toLowerCase().default("usd"),
  // Optional email provider (Resend). Without it, transactional mail is logged.
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Fast Wallet <no-reply@fastwallet.in>"),
  // Operational deposit address for the BEP20 manual-review flow.
  // Users transfer USDT (BNB Smart Chain) here and submit the tx hash;
  // an administrator verifies the hash before the wallet is credited.
  DEPOSIT_ADDRESS_BEP20: z
    .string()
    .default("0x3Ec51630c8d6BEE9C4b925Aa81BD9B999D4eDADe"),
  DEPOSIT_ADDRESS_TRC20: z
    .string()
    .default(""),
});

export type Env = z.infer<typeof envSchema> & {
  /**
   * The single administrator account for the platform (lower-cased), set in
   * the environment. Exactly one email may ever hold admin privileges. Any
   * other account holding the admin role is never treated as an admin.
   */
  ADMIN_EMAIL?: string;
  /**
   * Admin password, read from the environment at login/bootstrap time. Change
   * it here anytime — the next login with it rotates the stored hash and
   * grants access. NEVER committed or exposed to clients.
   */
  ADMIN_PASSWORD?: string;
  /** Human-readable reason the admin settings were ignored (never contains values). */
  ADMIN_CONFIG_ISSUE?: string;
};

/** Raised when a required/typed environment variable is invalid. Lists variable
 *  NAMES only — never values — so it is safe to log. */
export class EnvConfigError extends Error {
  readonly code = "ENV_INVALID";
  constructor(public readonly problems: string[]) {
    super(`Invalid environment configuration: ${problems.join("; ")}`);
    this.name = "EnvConfigError";
  }
}

/**
 * Admin credentials are parsed LEANIENTLY. A blank value (e.g. a verbatim copy
 * of `.env.example`) means "not configured", and an invalid value disables the
 * admin credential with a clear server-side warning instead of throwing — a bad
 * ADMIN_* variable must never take down registration/login for every user.
 */
function readAdminConfig(raw: NodeJS.ProcessEnv): Pick<Env, "ADMIN_EMAIL" | "ADMIN_PASSWORD" | "ADMIN_CONFIG_ISSUE"> {
  const emailRaw = (raw.ADMIN_EMAIL ?? "").trim();
  const passwordRaw = raw.ADMIN_PASSWORD ?? "";

  let email: string | undefined;
  let password: string | undefined;
  const issues: string[] = [];

  if (emailRaw) {
    if (z.string().email().safeParse(emailRaw).success) email = emailRaw.toLowerCase();
    else issues.push("ADMIN_EMAIL is not a valid email address");
  }
  if (passwordRaw) {
    if (passwordRaw.length < 8) issues.push("ADMIN_PASSWORD must be at least 8 characters");
    else if (!email) issues.push("ADMIN_PASSWORD is set but ADMIN_EMAIL is missing or invalid");
    else password = passwordRaw;
  }

  return {
    ADMIN_EMAIL: email,
    ADMIN_PASSWORD: password,
    ADMIN_CONFIG_ISSUE: issues.length ? issues.join("; ") : undefined,
  };
}

let cached: Env | null = null;

export function getEnv(): Env {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      throw new EnvConfigError(
        parsed.error.issues.map((i) => {
          // Zod's enum message echoes the offending value — never log values.
          const detail = i.code === "invalid_enum_value" ? `must be one of ${i.options.join(" | ")}` : i.message;
          return `${i.path.join(".") || "(root)"}: ${detail}`;
        }),
      );
    }
    const admin = readAdminConfig(process.env);
    if (admin.ADMIN_CONFIG_ISSUE) {
      console.warn(`[fast-wallet] admin credential disabled — ${admin.ADMIN_CONFIG_ISSUE}. Fix it in your environment.`);
    }
    cached = { ...parsed.data, ...admin };
  }
  return cached;
}

/** Test helper: forget the memoised environment. */
export function resetEnvCache(): void {
  cached = null;
}

export function cookieSecure(): boolean {
  const e = getEnv();
  if (e.COOKIE_SECURE !== undefined) return e.COOKIE_SECURE === "true";
  return e.NODE_ENV === "production";
}

export const SESSION_COOKIE = "fastwallet_session";
