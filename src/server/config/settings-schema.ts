import { z } from "zod";
import { AMOUNT_RE } from "@/server/utils/money";

/**
 * Pure, dependency-free definition of the platform's mutable operational
 * policy. Kept separate from the service so validation can be unit-tested
 * (and imported by the client) without a database connection.
 *
 * Secrets never belong here — only non-sensitive operational configuration.
 */
const amount = (def: string) => z.string().regex(AMOUNT_RE, "Enter a valid amount").default(def);

export const settingsSchema = z.object({
  /** Deposits */
  depositsEnabled: z.boolean().default(true),
  /** No hardcoded $8/$10 floor: operators choose the minimum (default $1).
   *  Card payments additionally honour the provider's own minimum charge. */
  minDeposit: amount("1"),
  maxDeposit: amount("25000"),
  depositMaintenanceMessage: z.string().max(300).default(""),

  /** Withdrawals */
  withdrawalsEnabled: z.boolean().default(true),
  minWithdrawal: amount("5"),
  maxWithdrawal: amount("25000"),
  withdrawalFee: amount("1"),
  withdrawalMaintenanceMessage: z.string().max(300).default(""),

  /** Per-user daily velocity limits (0 = unlimited) */
  dailyDepositLimit: amount("0"),
  dailyWithdrawalLimit: amount("0"),

  /** Networks & providers */
  networkBep20Enabled: z.boolean().default(true),
  cardDepositsEnabled: z.boolean().default(true),

  /** Risk & approvals */
  highValueAdjustmentThreshold: amount("1000"),
  dualApprovalEnabled: z.boolean().default(false),
  allowNegativeBalance: z.boolean().default(false),
  failedLoginAlertThreshold: z.coerce.number().int().min(1).max(100).default(5),

  /** Notifications */
  notifyOnAdjustment: z.boolean().default(true),
  notifyOnDeposit: z.boolean().default(true),
  notifyOnWithdrawal: z.boolean().default(true),
});

export type PlatformConfig = z.infer<typeof settingsSchema>;
export type SettingKey = keyof PlatformConfig;

export const DEFAULT_SETTINGS: PlatformConfig = settingsSchema.parse({});

/** Settings safe to expose to authenticated end-users (no risk policy). */
export const PUBLIC_SETTING_KEYS: SettingKey[] = [
  "depositsEnabled",
  "minDeposit",
  "maxDeposit",
  "depositMaintenanceMessage",
  "withdrawalsEnabled",
  "minWithdrawal",
  "maxWithdrawal",
  "withdrawalFee",
  "withdrawalMaintenanceMessage",
  "networkBep20Enabled",
  "cardDepositsEnabled",
];
