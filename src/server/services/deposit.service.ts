import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { depositRequests, type User, type DepositRequest } from "@/db/schema";
import { ApiError } from "@/server/utils/api";
import { audit } from "@/server/utils/audit";
import { money } from "@/server/utils/money";
import { depositAddresses } from "@/server/services/wallet.service";
import { assertDepositAllowed } from "@/server/services/limits.service";
import type { DepositCreateInput, RequestListQuery } from "@/server/validators";

export async function createDepositRequest(
  user: User,
  input: DepositCreateInput,
  ip: string,
): Promise<{ request: DepositRequest; duplicate: boolean }> {
  // Idempotency: a repeated submission returns the original record.
  const [existing] = await db
    .select()
    .from(depositRequests)
    .where(and(eq(depositRequests.userId, user.id), eq(depositRequests.idempotencyKey, input.idempotencyKey)))
    .limit(1);
  if (existing) return { request: existing, duplicate: true };

  // Runtime-configurable limits, account restrictions and maintenance mode.
  await assertDepositAllowed(user, { amount: input.amount, provider: "manual" });

  // Global tx-hash uniqueness, checked before insert for a friendly error;
  // the unique index is the race-proof backstop.
  const [dup] = await db
    .select({ id: depositRequests.id })
    .from(depositRequests)
    .where(eq(depositRequests.txReference, input.txReference))
    .limit(1);
  if (dup) {
    throw ApiError.conflict(
      "DUPLICATE_TX_HASH",
      "This transaction hash has already been submitted. Each transfer can only be claimed once.",
    );
  }

  const [request] = await db
    .insert(depositRequests)
    .values({
      userId: user.id,
      asset: input.asset,
      network: input.network,
      amount: money(input.amount),
      depositAddress: depositAddresses()[input.network],
      txReference: input.txReference,
      idempotencyKey: input.idempotencyKey,
    })
    .returning();
  if (!request) throw new ApiError(500, "INTERNAL", "Failed to create deposit request");

  await audit({
    actorId: user.id,
    action: "deposit.create",
    targetType: "deposit_request",
    targetId: request.id,
    metadata: { amount: request.amount, network: request.network, duplicate: false },
    ip,
  });
  return { request, duplicate: false };
}

export async function listDepositRequests(user: User, query: RequestListQuery) {
  const conds = [eq(depositRequests.userId, user.id)];
  if (query.status) conds.push(eq(depositRequests.status, query.status));
  const where = and(...conds);

  const items = await db
    .select()
    .from(depositRequests)
    .where(where)
    .orderBy(desc(depositRequests.createdAt))
    .limit(query.limit)
    .offset((query.page - 1) * query.limit);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(depositRequests)
    .where(where);

  return { items, total: Number(count ?? 0), page: query.page, limit: query.limit };
}

export async function getDepositRequest(user: User, id: string, allowAdmin = false): Promise<DepositRequest> {
  const [request] = await db.select().from(depositRequests).where(eq(depositRequests.id, id)).limit(1);
  if (!request || (!allowAdmin && request.userId !== user.id)) {
    throw ApiError.notFound("Deposit request not found");
  }
  return request;
}
