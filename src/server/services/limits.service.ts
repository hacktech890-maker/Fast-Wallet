import Decimal from "decimal.js";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { depositRequests, withdrawalRequests, type User } from "@/db/schema";
import { ApiError } from "@/server/utils/api";
import { getSettings } from "@/server/services/settings.service";
import { money } from "@/server/utils/money";

/**
 * Stripe's real-world minimum charge (USD). We never promise success below
 * the provider's own floor — the user gets a clear explanation instead.
 */
export const STRIPE_MIN_CHARGE_USD = "0.50";

const startOfToday = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

async function sumToday(table: typeof depositRequests | typeof withdrawalRequests, userId: string) {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${table.amount}::numeric), 0)` })
    .from(table)
    .where(and(eq(table.userId, userId), gte(table.createdAt, startOfToday())));
  return new Decimal(row?.total ?? "0");
}

export interface LimitCheck {
  amount: string;
}

/** Validate a deposit against platform settings, provider floors and
 *  per-user restrictions. All limits are configurable at runtime. */
export async function assertDepositAllowed(user: User, input: LimitCheck & { provider: "stripe" | "manual" }) {
  const settings = await getSettings();
  const amount = new Decimal(input.amount);

  if (!settings.depositsEnabled) {
    throw new ApiError(
      503,
      "DEPOSITS_DISABLED",
      settings.depositMaintenanceMessage || "Deposits are temporarily unavailable. Please try again later.",
    );
  }
  if (user.depositsDisabled) {
    throw ApiError.forbidden("Deposits are disabled on your account. Please contact support.");
  }
  if (input.provider === "stripe" && !settings.cardDepositsEnabled) {
    throw new ApiError(503, "CARD_DEPOSITS_DISABLED", "Card deposits are temporarily unavailable.");
  }

  const min = new Decimal(settings.minDeposit);
  if (amount.lt(min)) {
    throw ApiError.badRequest("BELOW_MINIMUM", `The minimum deposit is ${money(min)} USDT.`);
  }
  // Provider floor: honest message rather than silently adjusting the amount.
  if (input.provider === "stripe" && amount.lt(new Decimal(STRIPE_MIN_CHARGE_USD))) {
    throw ApiError.badRequest(
      "BELOW_PROVIDER_MINIMUM",
      `Card payments cannot be processed below ${STRIPE_MIN_CHARGE_USD} USD — this is a limit set by our payment provider, not by Fast Wallet. Please choose a larger amount or use a crypto deposit.`,
    );
  }
  const max = new Decimal(settings.maxDeposit);
  if (max.gt(0) && amount.gt(max)) {
    throw ApiError.badRequest("ABOVE_MAXIMUM", `The maximum deposit is ${money(max)} USDT.`);
  }

  const dailyLimit = new Decimal(settings.dailyDepositLimit);
  if (dailyLimit.gt(0)) {
    const used = await sumToday(depositRequests, user.id);
    if (used.plus(amount).gt(dailyLimit)) {
      throw ApiError.badRequest(
        "DAILY_LIMIT",
        `This exceeds your daily deposit limit of ${money(dailyLimit)} USDT (${money(used)} already requested today).`,
      );
    }
  }
}

export async function assertWithdrawalAllowed(user: User, input: LimitCheck) {
  const settings = await getSettings();
  const amount = new Decimal(input.amount);

  if (!settings.withdrawalsEnabled) {
    throw new ApiError(
      503,
      "WITHDRAWALS_DISABLED",
      settings.withdrawalMaintenanceMessage || "Withdrawals are temporarily unavailable. Please try again later.",
    );
  }
  if (user.withdrawalsDisabled) {
    throw ApiError.forbidden("Withdrawals are disabled on your account. Please contact support.");
  }

  const min = new Decimal(settings.minWithdrawal);
  if (amount.lt(min)) {
    throw ApiError.badRequest("BELOW_MINIMUM", `The minimum transfer is ${money(min)} USDT.`);
  }
  const max = new Decimal(settings.maxWithdrawal);
  if (max.gt(0) && amount.gt(max)) {
    throw ApiError.badRequest("ABOVE_MAXIMUM", `The maximum transfer is ${money(max)} USDT.`);
  }

  const dailyLimit = new Decimal(settings.dailyWithdrawalLimit);
  if (dailyLimit.gt(0)) {
    const used = await sumToday(withdrawalRequests, user.id);
    if (used.plus(amount).gt(dailyLimit)) {
      throw ApiError.badRequest(
        "DAILY_LIMIT",
        `This exceeds your daily transfer limit of ${money(dailyLimit)} USDT (${money(used)} already requested today).`,
      );
    }
  }
}
