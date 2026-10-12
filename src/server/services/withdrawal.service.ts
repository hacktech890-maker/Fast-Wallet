import { randomUUID, randomBytes } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import Decimal from "decimal.js";
import { db } from "@/db";
import {
  wallets,
  transactions,
  withdrawalRequests,
  type User,
  type WithdrawalRequest,
} from "@/db/schema";
import { ApiError } from "@/server/utils/api";
import { audit } from "@/server/utils/audit";
import { add, money } from "@/server/utils/money";
import { numSql } from "@/server/utils/sql";
import { getSettings } from "@/server/services/settings.service";
import { assertWithdrawalAllowed } from "@/server/services/limits.service";
import type { WithdrawalCreateInput, RequestListQuery } from "@/server/validators";

/**
 * Create a withdrawal request and atomically reserve the funds.
 * The balance guard lives in the UPDATE's WHERE clause, so concurrent
 * requests can never over-reserve the wallet.
 */
/** Unambiguous alphabet (no 0/O/1/I) for human-readable transfer codes. */
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function generateTransferCode(): string {
  const bytes = randomBytes(8);
  let body = "";
  for (let i = 0; i < 8; i++) body += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  return `FW-${body.slice(0, 4)}-${body.slice(4)}`;
}

export async function createWithdrawalRequest(
  user: User,
  input: WithdrawalCreateInput,
  ip: string,
): Promise<{ request: WithdrawalRequest; duplicate: boolean }> {
  const settings = await getSettings();
  const fee = money(settings.withdrawalFee);
  const amount = money(input.amount);
  const total = add(amount, fee);

  await assertWithdrawalAllowed(user, { amount });

  const [existing] = await db
    .select()
    .from(withdrawalRequests)
    .where(and(eq(withdrawalRequests.userId, user.id), eq(withdrawalRequests.idempotencyKey, input.idempotencyKey)))
    .limit(1);
  if (existing) return { request: existing, duplicate: true };

  const requestId = randomUUID();

  const request = await db.transaction(async (tx) => {
    // 1. Atomically move available -> reserved, only if funds suffice.
    const [wallet] = await tx
      .update(wallets)
      .set({
        available: numSql(sql`(${wallets.available}::numeric - ${total}::numeric)`),
        reserved: numSql(sql`(${wallets.reserved}::numeric + ${total}::numeric)`),
        updatedAt: new Date(),
      })
      .where(and(eq(wallets.userId, user.id), sql`${wallets.available}::numeric >= ${total}::numeric`))
      .returning();
    if (!wallet) {
      throw ApiError.badRequest(
        "INSUFFICIENT_FUNDS",
        `Insufficient available balance. You need ${total} USDT including the ${fee} USDT fee.`,
      );
    }

    // 2. Create the request record with a unique, user-facing transfer code.
    let req: WithdrawalRequest | undefined;
    for (let attempt = 0; attempt < 5 && !req; attempt++) {
      const [row] = await tx
        .insert(withdrawalRequests)
        .values({
          id: requestId,
          userId: user.id,
          asset: input.asset,
          network: input.network,
          amount,
          fee,
          destinationAddress: input.destinationAddress ?? null,
          transferCode: generateTransferCode(),
          idempotencyKey: input.idempotencyKey,
        })
        .onConflictDoNothing({ target: withdrawalRequests.transferCode })
        .returning();
      req = row;
    }
    if (!req) throw new ApiError(500, "INTERNAL", "Failed to create withdrawal request");

    // 3. Mirror the reservation as a pending ledger entry.
    await tx.insert(transactions).values({
      userId: user.id,
      type: "withdrawal",
      status: "pending",
      asset: input.asset,
      network: input.network,
      amount: money(new Decimal(total).negated()),
      fee,
      balanceAfter: null,
      reference: `wd:${req.id}`,
      counterparty: input.destinationAddress ?? req.transferCode,
      note: `Transfer ${req.transferCode} — awaiting administrative review`,
      isSimulated: false,
    });

    await audit(
      {
        actorId: user.id,
        action: "withdrawal.create",
        targetType: "withdrawal_request",
        targetId: req.id,
        metadata: { amount, fee, total, network: input.network, transferCode: req.transferCode },
        ip,
      },
      tx,
    );
    return req;
  });

  return { request, duplicate: false };
}

/**
 * Cancel a pending request and restore the reserved funds.
 * The status transition is conditional, so a double cancel or a race with
 * an admin review cannot restore funds twice.
 */
export async function cancelWithdrawalRequest(user: User, id: string, ip: string): Promise<WithdrawalRequest> {
  return db.transaction(async (tx) => {
    const [req] = await tx
      .update(withdrawalRequests)
      .set({ status: "cancelled", reviewNote: "Cancelled by account owner", updatedAt: new Date() })
      .where(and(eq(withdrawalRequests.id, id), eq(withdrawalRequests.userId, user.id), eq(withdrawalRequests.status, "pending")))
      .returning();
    if (!req) {
      const [exists] = await tx
        .select({ status: withdrawalRequests.status })
        .from(withdrawalRequests)
        .where(and(eq(withdrawalRequests.id, id), eq(withdrawalRequests.userId, user.id)))
        .limit(1);
      if (!exists) throw ApiError.notFound("Withdrawal request not found");
      throw ApiError.conflict("NOT_CANCELLABLE", `This request is already ${exists.status} and can no longer be cancelled`);
    }

    const total = add(req.amount, req.fee);
    const [wallet] = await tx
      .update(wallets)
      .set({
        available: numSql(sql`(${wallets.available}::numeric + ${total}::numeric)`),
        reserved: numSql(sql`(${wallets.reserved}::numeric - ${total}::numeric)`),
        updatedAt: new Date(),
      })
      .where(and(eq(wallets.userId, user.id), sql`${wallets.reserved}::numeric >= ${total}::numeric`))
      .returning();
    if (!wallet) throw ApiError.conflict("RESERVE_MISMATCH", "Reserved balance is inconsistent — please contact support");

    await tx
      .update(transactions)
      .set({ status: "cancelled" })
      .where(and(eq(transactions.userId, user.id), eq(transactions.reference, `wd:${req.id}`)));

    await audit(
      { actorId: user.id, action: "withdrawal.cancel", targetType: "withdrawal_request", targetId: req.id, metadata: { restored: total }, ip },
      tx,
    );
    return req;
  });
}

export async function listWithdrawalRequests(user: User, query: RequestListQuery) {
  const conds = [eq(withdrawalRequests.userId, user.id)];
  if (query.status) conds.push(eq(withdrawalRequests.status, query.status));
  const where = and(...conds);

  const items = await db
    .select()
    .from(withdrawalRequests)
    .where(where)
    .orderBy(desc(withdrawalRequests.createdAt))
    .limit(query.limit)
    .offset((query.page - 1) * query.limit);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(withdrawalRequests)
    .where(where);

  return { items, total: Number(count ?? 0), page: query.page, limit: query.limit };
}

export async function getWithdrawalRequest(user: User, id: string): Promise<WithdrawalRequest> {
  const [request] = await db.select().from(withdrawalRequests).where(eq(withdrawalRequests.id, id)).limit(1);
  if (!request || request.userId !== user.id) throw ApiError.notFound("Withdrawal request not found");
  return request;
}
