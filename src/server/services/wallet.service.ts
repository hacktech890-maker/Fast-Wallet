import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  wallets,
  transactions,
  depositRequests,
  withdrawalRequests,
  type User,
} from "@/db/schema";
import { getEnv } from "@/server/config/env";
import { getSettings } from "@/server/services/settings.service";
import { add, money } from "@/server/utils/money";

async function getOrCreateWallet(userId: string) {
  const [w] = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  if (w) return w;
  const [created] = await db
    .insert(wallets)
    .values({ userId, available: money(0), reserved: money(0), isSimulated: false })
    .onConflictDoNothing({ target: wallets.userId })
    .returning();
  if (created) return created;
  const [again] = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  return again!;
}

export function depositAddresses() {
  const env = getEnv();
  return {
    BEP20: env.DEPOSIT_ADDRESS_BEP20 || "Not configured",
    TRC20: env.DEPOSIT_ADDRESS_TRC20 || "Not configured",
  } as const;
}

export function cardDepositsEnabled(): boolean {
  return Boolean(getEnv().STRIPE_SECRET_KEY);
}

export async function getWalletSummary(user: User) {
  const settings = await getSettings();
  const wallet = await getOrCreateWallet(user.id);

  const [depositAgg] = await db
    .select({
      pendingCount: sql<number>`count(*) filter (where ${depositRequests.status} = 'pending')::int`,
      pendingSum: sql<string>`coalesce(sum(${depositRequests.amount}::numeric) filter (where ${depositRequests.status} = 'pending'), 0)`,
      completedSum: sql<string>`coalesce(sum(${depositRequests.amount}::numeric) filter (where ${depositRequests.status} = 'approved'), 0)`,
    })
    .from(depositRequests)
    .where(eq(depositRequests.userId, user.id));

  const [withdrawalAgg] = await db
    .select({
      pendingCount: sql<number>`count(*) filter (where ${withdrawalRequests.status} = 'pending')::int`,
      pendingSum: sql<string>`coalesce(sum((${withdrawalRequests.amount}::numeric + ${withdrawalRequests.fee}::numeric)) filter (where ${withdrawalRequests.status} = 'pending'), 0)`,
      completedSum: sql<string>`coalesce(sum(${withdrawalRequests.amount}::numeric) filter (where ${withdrawalRequests.status} = 'approved'), 0)`,
    })
    .from(withdrawalRequests)
    .where(eq(withdrawalRequests.userId, user.id));

  // Admin credits count as deposits in "Total deposited".
  const [adminCreditAgg] = await db
    .select({ sum: sql<string>`coalesce(sum(${transactions.amount}::numeric), 0)` })
    .from(transactions)
    .where(and(eq(transactions.userId, user.id), eq(transactions.type, "admin_credit"), eq(transactions.status, "completed")));

  const recent = await db
    .select()
    .from(transactions)
    .where(eq(transactions.userId, user.id))
    .orderBy(desc(transactions.createdAt))
    .limit(6);

  return {
    simulated: false,
    label: "Your balance updates as soon as a deposit is confirmed or credited.",
    asset: "USDT",
    available: money(wallet.available),
    reserved: money(wallet.reserved),
    total: add(wallet.available, wallet.reserved),
    depositAddresses: depositAddresses(),
    fee: { withdrawal: settings.withdrawalFee },
    // Effective, runtime-configurable limits — the UI and API share them.
    limits: {
      minDeposit: settings.minDeposit,
      maxDeposit: settings.maxDeposit,
      minWithdrawal: settings.minWithdrawal,
      maxWithdrawal: settings.maxWithdrawal,
      depositsEnabled: settings.depositsEnabled,
      withdrawalsEnabled: settings.withdrawalsEnabled,
      cardDepositsEnabled: settings.cardDepositsEnabled,
      depositMaintenanceMessage: settings.depositMaintenanceMessage,
      withdrawalMaintenanceMessage: settings.withdrawalMaintenanceMessage,
      accountDepositsDisabled: user.depositsDisabled,
      accountWithdrawalsDisabled: user.withdrawalsDisabled,
    },
    stats: {
      pendingDeposits: { count: Number(depositAgg?.pendingCount ?? 0), sum: money(depositAgg?.pendingSum ?? "0") },
      pendingWithdrawals: { count: Number(withdrawalAgg?.pendingCount ?? 0), sum: money(withdrawalAgg?.pendingSum ?? "0") },
      totalDeposited: add(depositAgg?.completedSum ?? "0", adminCreditAgg?.sum ?? "0"),
      totalWithdrawn: money(withdrawalAgg?.completedSum ?? "0"),
    },
    recentTransactions: recent,
  };
}

export async function getBalances(user: User) {
  const wallet = await getOrCreateWallet(user.id);
  return {
    simulated: false,
    balances: [
      {
        asset: "USDT",
        name: "Tether USD",
        available: money(wallet.available),
        reserved: money(wallet.reserved),
        total: add(wallet.available, wallet.reserved),
        networks: [
          { network: "BEP20", chain: "BNB Smart Chain", address: depositAddresses().BEP20 },
          { network: "TRC20", chain: "TRON", address: depositAddresses().TRC20 },
        ],
      },
    ],
  };
}
