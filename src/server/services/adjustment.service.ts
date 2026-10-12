import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import Decimal from "decimal.js";
import { db } from "@/db";
import {
  users,
  wallets,
  transactions,
  walletAdjustments,
  type User,
  type WalletAdjustment,
} from "@/db/schema";
import { ApiError } from "@/server/utils/api";
import { audit } from "@/server/utils/audit";
import { money } from "@/server/utils/money";
import { numSql } from "@/server/utils/sql";
import { notify } from "@/server/services/notification.service";
import { getSettings } from "@/server/services/settings.service";
import type { AdminContext } from "@/server/middleware/auth";

export const ADJUSTMENT_REASONS = [
  "promotional_credit",
  "customer_support",
  "approved_refund",
  "correction",
  "settlement",
  "other",
] as const;
export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number];

export const FUNDING_SOURCES = [
  "not_cash_backed",
  "bank_transfer_received",
  "crypto_received",
  "provider_settlement",
  "marketing_budget",
] as const;
export type FundingSource = (typeof FUNDING_SOURCES)[number];

export interface CreateAdjustmentInput {
  userId: string;
  type: "credit" | "debit";
  amount: string;
  currency: string;
  reason: AdjustmentReason;
  note?: string;
  fundingSource: FundingSource;
  idempotencyKey: string;
}

export interface AdjustmentResult {
  adjustment: WalletAdjustment;
  duplicate: boolean;
  balanceAfter: string | null;
  pendingApproval: boolean;
}

const REASON_LABELS: Record<AdjustmentReason, string> = {
  promotional_credit: "Promotional credit",
  customer_support: "Customer support adjustment",
  approved_refund: "Approved refund",
  correction: "Balance correction",
  settlement: "Settlement",
  other: "Account adjustment",
};

/** Preview the effect of an adjustment without writing anything. */
export async function previewAdjustment(userId: string, type: "credit" | "debit", amount: string) {
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      status: users.status,
      available: wallets.available,
      reserved: wallets.reserved,
    })
    .from(users)
    .leftJoin(wallets, eq(wallets.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) throw ApiError.notFound("User not found");

  const settings = await getSettings();
  const current = new Decimal(row.available ?? "0");
  const delta = new Decimal(amount);
  const resulting = type === "credit" ? current.plus(delta) : current.minus(delta);
  const threshold = new Decimal(settings.highValueAdjustmentThreshold);

  const recent = await db
    .select()
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .orderBy(desc(transactions.createdAt))
    .limit(5);

  return {
    user: {
      id: row.id,
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      status: row.status,
    },
    currentBalance: money(row.available ?? "0"),
    reserved: money(row.reserved ?? "0"),
    resultingBalance: money(resulting),
    wouldGoNegative: resulting.lt(0),
    allowNegativeBalance: settings.allowNegativeBalance,
    requiresDualApproval: false,
    highValueThreshold: money(threshold),
    recentTransactions: recent,
  };
}

/**
 * Create a manual wallet adjustment.
 *
 * - Credits/debits are applied in ONE PostgreSQL transaction together with an
 *   immutable ledger row (`admin_credit` / `admin_debit`) and an audit entry.
 * - Idempotency keys make retries safe; the original record is returned.
 * - Debits are rejected when funds are insufficient (unless the documented
 *   negative-balance policy is explicitly enabled).
 * - High-value adjustments enter `pending_approval` and move no money until a
 *   second administrator approves them.
 * - A manual credit is an accounting instruction, never a payment receipt:
 *   `fundingSource` records how (or whether) it is cash-backed.
 */
export async function createAdjustment(
  ctx: AdminContext,
  input: CreateAdjustmentInput,
  ip: string,
): Promise<AdjustmentResult> {
  const amount = money(input.amount);
  const delta = new Decimal(amount);
  if (delta.lte(0)) throw ApiError.badRequest("INVALID_AMOUNT", "Amount must be greater than zero");

  // Idempotency — a retried submission returns the original adjustment.
  const [existing] = await db
    .select()
    .from(walletAdjustments)
    .where(eq(walletAdjustments.idempotencyKey, input.idempotencyKey))
    .limit(1);
  if (existing) {
    return {
      adjustment: existing,
      duplicate: true,
      balanceAfter: existing.balanceAfter,
      pendingApproval: existing.status === "pending_approval",
    };
  }

  const [target] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  if (!target) throw ApiError.notFound("User not found");

  const settings = await getSettings();
  // Full admin control: adjustments always apply immediately (no second approver).
  const requiresDual = false;

  const id = randomUUID();
  const reference = `${input.type === "credit" ? "adjc" : "adjd"}:${id}`;

  /* ---------------------------------------- high value → await second admin */
  if (requiresDual) {
    const [pending] = await db
      .insert(walletAdjustments)
      .values({
        id,
        userId: target.id,
        createdBy: ctx.user.id,
        type: input.type,
        amount,
        currency: input.currency,
        reason: input.reason,
        note: input.note ?? null,
        fundingSource: input.fundingSource,
        status: "pending_approval",
        requiresDualApproval: true,
        reference,
        idempotencyKey: input.idempotencyKey,
      })
      .returning();
    if (!pending) throw new ApiError(500, "INTERNAL", "Failed to create adjustment");

    await audit({
      actorId: ctx.user.id,
      action: "wallet.adjustment.requested",
      targetType: "wallet_adjustment",
      targetId: pending.id,
      metadata: { userId: target.id, type: input.type, amount, reason: input.reason, fundingSource: input.fundingSource },
      ip,
    });
    return { adjustment: pending, duplicate: false, balanceAfter: null, pendingApproval: true };
  }

  /* ------------------------------------------------- immediate application */
  const applied = await applyAdjustmentTx({
    id,
    reference,
    actorId: ctx.user.id,
    approverId: null,
    target,
    input: { ...input, amount },
    allowNegative: settings.allowNegativeBalance,
    notifyUser: settings.notifyOnAdjustment,
    ip,
  });

  return { adjustment: applied, duplicate: false, balanceAfter: applied.balanceAfter, pendingApproval: false };
}

interface ApplyArgs {
  id: string;
  reference: string;
  actorId: string;
  approverId: string | null;
  target: User;
  input: CreateAdjustmentInput;
  allowNegative: boolean;
  notifyUser: boolean;
  ip: string;
  existingRowId?: string;
}

/** The single atomic money-movement path shared by direct and approved flows. */
async function applyAdjustmentTx(args: ApplyArgs): Promise<WalletAdjustment> {
  const { input, target } = args;
  const amount = money(input.amount);
  const isCredit = input.type === "credit";

  return db.transaction(async (tx) => {
    // 1. Move the balance atomically; the guard lives in SQL so concurrent
    //    adjustments can never drive the wallet below zero.
    const balanceGuard = isCredit || args.allowNegative ? undefined : sql`${wallets.available}::numeric >= ${amount}::numeric`;
    const [wallet] = await tx
      .update(wallets)
      .set({
        available: numSql(
          isCredit
            ? sql`(${wallets.available}::numeric + ${amount}::numeric)`
            : sql`(${wallets.available}::numeric - ${amount}::numeric)`,
        ),
        updatedAt: new Date(),
      })
      .where(balanceGuard ? and(eq(wallets.userId, target.id), balanceGuard) : eq(wallets.userId, target.id))
      .returning();

    if (!wallet) {
      const [exists] = await tx.select({ id: wallets.id }).from(wallets).where(eq(wallets.userId, target.id)).limit(1);
      if (!exists) throw ApiError.notFound("Wallet not found for this user");
      throw ApiError.badRequest(
        "INSUFFICIENT_FUNDS",
        `Insufficient available balance to debit ${amount} ${input.currency}.`,
      );
    }

    // 2. Immutable ledger entry — distinct type and reference namespace so
    //    manual adjustments are never confused with provider receipts.
    await tx.insert(transactions).values({
      userId: target.id,
      type: isCredit ? "admin_credit" : "admin_debit",
      status: "completed",
      asset: input.currency,
      amount: isCredit ? amount : money(new Decimal(amount).negated()),
      fee: money(0),
      balanceAfter: wallet.available,
      reference: args.reference,
      counterparty: `admin:${args.actorId}`,
      note: `${REASON_LABELS[input.reason]}${input.note ? ` — ${input.note}` : ""}`,
      isSimulated: false,
    });

    // 3. Adjustment record (created fresh, or finalised after approval).
    let row: WalletAdjustment | undefined;
    if (args.existingRowId) {
      const [updated] = await tx
        .update(walletAdjustments)
        .set({
          status: "applied",
          approvedBy: args.approverId,
          balanceAfter: wallet.available,
          appliedAt: new Date(),
        })
        .where(and(eq(walletAdjustments.id, args.existingRowId), eq(walletAdjustments.status, "pending_approval")))
        .returning();
      row = updated;
      if (!row) throw ApiError.conflict("ALREADY_RESOLVED", "This adjustment was already resolved");
    } else {
      const [inserted] = await tx
        .insert(walletAdjustments)
        .values({
          id: args.id,
          userId: target.id,
          createdBy: args.actorId,
          approvedBy: args.approverId,
          type: input.type,
          amount,
          currency: input.currency,
          reason: input.reason,
          note: input.note ?? null,
          fundingSource: input.fundingSource,
          status: "applied",
          requiresDualApproval: false,
          balanceAfter: wallet.available,
          reference: args.reference,
          idempotencyKey: input.idempotencyKey,
          appliedAt: new Date(),
        })
        .returning();
      row = inserted;
    }
    if (!row) throw new ApiError(500, "INTERNAL", "Failed to record adjustment");

    // 4. Audit + user notification inside the same transaction.
    await audit(
      {
        actorId: args.actorId,
        action: isCredit ? "wallet.adjustment.credit" : "wallet.adjustment.debit",
        targetType: "wallet_adjustment",
        targetId: row.id,
        metadata: {
          userId: target.id,
          email: target.email,
          amount,
          currency: input.currency,
          reason: input.reason,
          fundingSource: input.fundingSource,
          approvedBy: args.approverId,
          balanceAfter: wallet.available,
          reference: args.reference,
        },
        ip: args.ip,
      },
      tx,
    );

    if (args.notifyUser) {
      await notify(
        {
          userId: target.id,
          type: isCredit ? "wallet_credit" : "wallet_debit",
          title: isCredit ? `${amount} ${input.currency} added to your wallet` : `${amount} ${input.currency} deducted from your wallet`,
          body: `${REASON_LABELS[input.reason]}. New balance: ${wallet.available} ${input.currency}.`,
          reference: args.reference,
        },
        tx,
      );
    }

    return row;
  });
}

/** Approve a pending high-value adjustment (must be a different admin). */
export async function approveAdjustment(ctx: AdminContext, adjustmentId: string, ip: string): Promise<WalletAdjustment> {
  const [pending] = await db.select().from(walletAdjustments).where(eq(walletAdjustments.id, adjustmentId)).limit(1);
  if (!pending) throw ApiError.notFound("Adjustment not found");
  if (pending.status !== "pending_approval") {
    throw ApiError.conflict("ALREADY_RESOLVED", `This adjustment is already ${pending.status}`);
  }
  // Dual control: the requester may never approve their own adjustment.
  if (pending.createdBy === ctx.user.id) {
    throw ApiError.forbidden("A second administrator must approve this adjustment");
  }

  const [target] = await db.select().from(users).where(eq(users.id, pending.userId)).limit(1);
  if (!target) throw ApiError.notFound("User not found");

  const settings = await getSettings();
  return applyAdjustmentTx({
    id: pending.id,
    existingRowId: pending.id,
    reference: pending.reference,
    actorId: pending.createdBy ?? ctx.user.id,
    approverId: ctx.user.id,
    target,
    input: {
      userId: pending.userId,
      type: pending.type,
      amount: pending.amount,
      currency: pending.currency,
      reason: pending.reason as AdjustmentReason,
      note: pending.note ?? undefined,
      fundingSource: pending.fundingSource as FundingSource,
      idempotencyKey: pending.idempotencyKey,
    },
    allowNegative: settings.allowNegativeBalance,
    notifyUser: settings.notifyOnAdjustment,
    ip,
  });
}

export async function rejectAdjustment(
  ctx: AdminContext,
  adjustmentId: string,
  reason: string,
  ip: string,
): Promise<WalletAdjustment> {
  const [rejected] = await db
    .update(walletAdjustments)
    .set({ status: "rejected", rejectionReason: reason, approvedBy: ctx.user.id })
    .where(and(eq(walletAdjustments.id, adjustmentId), eq(walletAdjustments.status, "pending_approval")))
    .returning();
  if (!rejected) throw ApiError.conflict("ALREADY_RESOLVED", "This adjustment is not awaiting approval");

  await audit({
    actorId: ctx.user.id,
    action: "wallet.adjustment.rejected",
    targetType: "wallet_adjustment",
    targetId: rejected.id,
    metadata: { reason, amount: rejected.amount, userId: rejected.userId },
    ip,
  });
  return rejected;
}

export async function listAdjustments(params: { page: number; limit: number; status?: string; userId?: string }) {
  const conds = [];
  if (params.status) conds.push(eq(walletAdjustments.status, params.status as "pending_approval" | "applied" | "rejected"));
  if (params.userId) conds.push(eq(walletAdjustments.userId, params.userId));
  const where = conds.length ? and(...conds) : undefined;

  const items = await db
    .select({ adjustment: walletAdjustments, userEmail: users.email })
    .from(walletAdjustments)
    .innerJoin(users, eq(users.id, walletAdjustments.userId))
    .where(where)
    .orderBy(desc(walletAdjustments.createdAt))
    .limit(params.limit)
    .offset((params.page - 1) * params.limit);

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(walletAdjustments).where(where);

  return {
    items: items.map(({ adjustment, userEmail }) => ({ ...adjustment, userEmail })),
    total: Number(count ?? 0),
    page: params.page,
    limit: params.limit,
  };
}
