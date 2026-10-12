import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  users,
  wallets,
  sessions,
  transactions,
  depositRequests,
  withdrawalRequests,
  auditLogs,
  userNotes,
} from "@/db/schema";
import { ApiError } from "@/server/utils/api";
import { audit } from "@/server/utils/audit";
import { add, money } from "@/server/utils/money";
import { numSql } from "@/server/utils/sql";
import { toCsv } from "@/server/utils/csv";
import { notify } from "@/server/services/notification.service";
import { startPasswordReset } from "@/server/services/auth.service";
import { sendEmail, passwordResetEmail } from "@/server/utils/mailer";
import { getEnv } from "@/server/config/env";
import type { z } from "zod";
import type { adminUsersQuerySchema, reviewSchema, requestListQuerySchema, auditQuerySchema } from "@/server/validators";

export type AdminUsersQueryInput = z.infer<typeof adminUsersQuerySchema>;
export type ReviewDecisionInput = z.infer<typeof reviewSchema>;
export type RequestListQueryInput = z.infer<typeof requestListQuerySchema>;
export type AuditQueryInput = z.infer<typeof auditQuerySchema>;

/* ---------------------------------------------------------------- users */

export async function listUsers(query: AdminUsersQueryInput) {
  const conds = [];
  if (query.q) {
    const like = `%${query.q}%`;
    const search = or(ilike(users.email, like), ilike(users.firstName, like), ilike(users.lastName, like));
    if (search) conds.push(search);
  }
  const where = conds.length ? and(...conds) : undefined;

  const items = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      status: users.status,
      blockedReason: users.blockedReason,
      createdAt: users.createdAt,
      available: wallets.available,
      reserved: wallets.reserved,
      simulated: wallets.isSimulated,
    })
    .from(users)
    .leftJoin(wallets, eq(wallets.userId, users.id))
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(query.limit)
    .offset((query.page - 1) * query.limit);

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users).where(where);

  return {
    items: items.map((u) => ({ ...u, available: money(u.available ?? "0"), reserved: money(u.reserved ?? "0") })),
    total: Number(count ?? 0),
    page: query.page,
    limit: query.limit,
  };
}

/* --------------------------------------------------- block / delete users */

async function loadTarget(adminId: string, userId: string) {
  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!target) throw ApiError.notFound("User not found");
  if (target.id === adminId) throw ApiError.forbidden("You cannot perform this action on your own account");
  if (target.role === "admin") throw ApiError.forbidden("Administrator accounts cannot be modified here");
  return target;
}

/**
 * Block or unblock a customer. Blocking revokes every active session
 * immediately, so access to the platform stops on the very next request.
 */
export async function setUserBlocked(
  adminId: string,
  userId: string,
  input: { blocked: boolean; reason?: string },
  ip: string,
) {
  const target = await loadTarget(adminId, userId);

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(users)
      .set({
        status: input.blocked ? "blocked" : "active",
        blockedAt: input.blocked ? new Date() : null,
        blockedReason: input.blocked ? (input.reason ?? "Blocked by administrator") : null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, target.id))
      .returning();
    if (!row) throw ApiError.notFound("User not found");

    if (input.blocked) {
      await tx
        .update(sessions)
        .set({ invalidatedAt: new Date() })
        .where(and(eq(sessions.userId, target.id), isNull(sessions.invalidatedAt)));
    }

    await audit(
      {
        actorId: adminId,
        action: input.blocked ? "admin.user.blocked" : "admin.user.unblocked",
        targetType: "user",
        targetId: target.id,
        metadata: { email: target.email, reason: input.reason },
        ip,
      },
      tx,
    );
    return row;
  });

  return {
    id: updated.id,
    email: updated.email,
    status: updated.status,
    blockedReason: updated.blockedReason,
  };
}

/**
 * Permanently delete a customer and all their data. Sessions, wallet,
 * requests and ledger rows cascade; the audit entry is written first so the
 * action remains traceable after the row disappears.
 */
export async function deleteUserAccount(adminId: string, userId: string, ip: string) {
  const target = await loadTarget(adminId, userId);

  await db.transaction(async (tx) => {
    await audit(
      {
        actorId: adminId,
        action: "admin.user.deleted",
        targetType: "user",
        targetId: target.id,
        metadata: { email: target.email, firstName: target.firstName, lastName: target.lastName },
        ip,
      },
      tx,
    );
    await tx.delete(users).where(eq(users.id, target.id));
  });

  return { id: target.id, email: target.email, deleted: true };
}

/* ------------------------------------------- status, restrictions, notes */

/** Suspend, ban or reactivate an account. Non-active states revoke sessions. */
export async function setUserStatus(
  adminId: string,
  userId: string,
  input: { status: "active" | "suspended" | "banned"; reason?: string },
  ip: string,
) {
  const target = await loadTarget(adminId, userId);
  const active = input.status === "active";

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(users)
      .set({
        status: input.status,
        blockedAt: active ? null : new Date(),
        blockedReason: active ? null : (input.reason ?? `Account ${input.status} by administrator`),
        updatedAt: new Date(),
      })
      .where(eq(users.id, target.id))
      .returning();
    if (!row) throw ApiError.notFound("User not found");

    if (!active) {
      await tx
        .update(sessions)
        .set({ invalidatedAt: new Date() })
        .where(and(eq(sessions.userId, target.id), isNull(sessions.invalidatedAt)));
    }

    await audit(
      {
        actorId: adminId,
        action: `admin.user.status.${input.status}`,
        targetType: "user",
        targetId: target.id,
        metadata: { email: target.email, previous: target.status, reason: input.reason },
        ip,
      },
      tx,
    );

    await notify(
      {
        userId: target.id,
        type: "account_status",
        title: active ? "Your account has been reactivated" : `Your account has been ${input.status}`,
        body: active
          ? "You can sign in and use Fast Wallet again."
          : input.reason ?? "Please contact support for more information.",
      },
      tx,
    );
    return row;
  });

  return { id: updated.id, email: updated.email, status: updated.status, blockedReason: updated.blockedReason };
}

/** Account-level deposit/withdrawal restrictions. */
export async function setUserRestrictions(
  adminId: string,
  userId: string,
  input: { depositsDisabled?: boolean; withdrawalsDisabled?: boolean; reason?: string },
  ip: string,
) {
  const target = await loadTarget(adminId, userId);
  const [row] = await db
    .update(users)
    .set({
      depositsDisabled: input.depositsDisabled ?? target.depositsDisabled,
      withdrawalsDisabled: input.withdrawalsDisabled ?? target.withdrawalsDisabled,
      updatedAt: new Date(),
    })
    .where(eq(users.id, target.id))
    .returning();
  if (!row) throw ApiError.notFound("User not found");

  await audit({
    actorId: adminId,
    action: "admin.user.restrictions",
    targetType: "user",
    targetId: target.id,
    metadata: {
      email: target.email,
      depositsDisabled: row.depositsDisabled,
      withdrawalsDisabled: row.withdrawalsDisabled,
      reason: input.reason,
    },
    ip,
  });
  return { id: row.id, depositsDisabled: row.depositsDisabled, withdrawalsDisabled: row.withdrawalsDisabled };
}

/** Revoke every active session (force logout) without changing the password. */
export async function revokeUserSessions(adminId: string, userId: string, ip: string) {
  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!target) throw ApiError.notFound("User not found");

  const revoked = await db
    .update(sessions)
    .set({ invalidatedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.invalidatedAt)))
    .returning({ id: sessions.id });

  await audit({
    actorId: adminId,
    action: "admin.user.sessions_revoked",
    targetType: "user",
    targetId: userId,
    metadata: { email: target.email, revoked: revoked.length },
    ip,
  });
  return { revoked: revoked.length };
}

/**
 * Trigger a password-reset email. Admins never see or set the password and
 * never receive the token in the response.
 */
export async function triggerPasswordReset(adminId: string, userId: string, ip: string) {
  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!target) throw ApiError.notFound("User not found");

  const result = await startPasswordReset(target.email, ip);
  if (result) {
    const env = getEnv();
    const resetUrl = `${env.NEXT_PUBLIC_APP_URL}/reset-password?token=${encodeURIComponent(result.token)}`;
    await sendEmail(passwordResetEmail(target.email, resetUrl, env.PASSWORD_RESET_TTL_MINUTES));
  }
  await audit({
    actorId: adminId,
    action: "admin.user.password_reset_sent",
    targetType: "user",
    targetId: userId,
    metadata: { email: target.email },
    ip,
  });
  return { sent: true, email: target.email };
}

/** Mark the account as email-verified, or require re-verification. */
export async function setEmailVerified(adminId: string, userId: string, verified: boolean, ip: string) {
  const [row] = await db
    .update(users)
    .set({ emailVerifiedAt: verified ? new Date() : null, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  if (!row) throw ApiError.notFound("User not found");

  await audit({
    actorId: adminId,
    action: verified ? "admin.user.email_verified" : "admin.user.email_unverified",
    targetType: "user",
    targetId: userId,
    metadata: { email: row.email },
    ip,
  });
  return { id: row.id, emailVerified: Boolean(row.emailVerifiedAt) };
}

export async function addUserNote(
  adminId: string,
  userId: string,
  input: { kind: "note" | "risk_flag"; body: string },
  ip: string,
) {
  const [target] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  if (!target) throw ApiError.notFound("User not found");

  const [note] = await db
    .insert(userNotes)
    .values({ userId, authorId: adminId, kind: input.kind, body: input.body })
    .returning();

  await audit({
    actorId: adminId,
    action: input.kind === "risk_flag" ? "admin.user.risk_flag" : "admin.user.note",
    targetType: "user",
    targetId: userId,
    metadata: { email: target.email, kind: input.kind },
    ip,
  });
  return note!;
}

/** CSV export of filtered user records (permission-gated at the route). */
export async function exportUsersCsv(query: AdminUsersQueryInput): Promise<string> {
  const rows = await listUsers({ ...query, page: 1, limit: 1000 });
  return toCsv(
    ["id", "email", "first_name", "last_name", "role", "status", "available", "reserved", "created_at"],
    rows.items.map((u) => [u.id, u.email, u.firstName, u.lastName, u.role, u.status, u.available, u.reserved, u.createdAt]),
  );
}

/* ------------------------------------------------------ pending approvals */

/** Combined approval queue: everything currently awaiting a decision. */
export async function listPendingApprovals() {
  const deposits = await db
    .select({ request: depositRequests, userEmail: users.email })
    .from(depositRequests)
    .innerJoin(users, eq(users.id, depositRequests.userId))
    .where(eq(depositRequests.status, "pending"))
    .orderBy(desc(depositRequests.createdAt))
    .limit(50);

  const withdrawals = await db
    .select({ request: withdrawalRequests, userEmail: users.email })
    .from(withdrawalRequests)
    .innerJoin(users, eq(users.id, withdrawalRequests.userId))
    .where(eq(withdrawalRequests.status, "pending"))
    .orderBy(desc(withdrawalRequests.createdAt))
    .limit(50);

  return {
    deposits: deposits.map(({ request, userEmail }) => ({ ...request, userEmail })),
    withdrawals: withdrawals.map(({ request, userEmail }) => ({ ...request, userEmail })),
    counts: { deposits: deposits.length, withdrawals: withdrawals.length },
  };
}

/* -------------------------------------------------------------- requests */

export async function listAllDeposits(query: RequestListQueryInput) {
  const conds = [];
  if (query.status) conds.push(eq(depositRequests.status, query.status));
  const where = conds.length ? and(...conds) : undefined;

  const items = await db
    .select({ request: depositRequests, userEmail: users.email })
    .from(depositRequests)
    .innerJoin(users, eq(users.id, depositRequests.userId))
    .where(where)
    .orderBy(desc(depositRequests.createdAt))
    .limit(query.limit)
    .offset((query.page - 1) * query.limit);

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(depositRequests).where(where);

  return {
    items: items.map(({ request, userEmail }) => ({ ...request, userEmail })),
    total: Number(count ?? 0),
    page: query.page,
    limit: query.limit,
  };
}

export async function listAllWithdrawals(query: RequestListQueryInput) {
  const conds = [];
  if (query.status) conds.push(eq(withdrawalRequests.status, query.status));
  const where = conds.length ? and(...conds) : undefined;

  const items = await db
    .select({ request: withdrawalRequests, userEmail: users.email })
    .from(withdrawalRequests)
    .innerJoin(users, eq(users.id, withdrawalRequests.userId))
    .where(where)
    .orderBy(desc(withdrawalRequests.createdAt))
    .limit(query.limit)
    .offset((query.page - 1) * query.limit);

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(withdrawalRequests).where(where);

  return {
    items: items.map(({ request, userEmail }) => ({ ...request, userEmail })),
    total: Number(count ?? 0),
    page: query.page,
    limit: query.limit,
  };
}

/* ------------------------------------------------------------------ review */

/**
 * Approve or reject a deposit. The status flip is a conditional UPDATE, so
 * two admins racing the same request can never double-credit the wallet.
 */
export async function reviewDeposit(adminId: string, id: string, input: ReviewDecisionInput, ip: string) {
  const nextStatus = input.action === "approve" ? ("approved" as const) : ("rejected" as const);

  return db.transaction(async (tx) => {
    const [req] = await tx
      .update(depositRequests)
      .set({ status: nextStatus, reviewedBy: adminId, reviewedAt: new Date(), reviewNote: input.note ?? null, updatedAt: new Date() })
      .where(and(eq(depositRequests.id, id), eq(depositRequests.status, "pending")))
      .returning();
    if (!req) {
      const [exists] = await tx.select({ status: depositRequests.status }).from(depositRequests).where(eq(depositRequests.id, id)).limit(1);
      if (!exists) throw ApiError.notFound("Deposit request not found");
      throw ApiError.conflict("ALREADY_REVIEWED", `This request was already ${exists.status}`);
    }

    if (nextStatus === "approved") {
      const [wallet] = await tx
        .update(wallets)
        .set({ available: numSql(sql`(${wallets.available}::numeric + ${req.amount}::numeric)`), updatedAt: new Date() })
        .where(eq(wallets.userId, req.userId))
        .returning();
      if (!wallet) throw ApiError.notFound("Wallet not found for this user");

      const inserted = await tx
        .insert(transactions)
        .values({
          userId: req.userId,
          type: "deposit",
          status: "completed",
          asset: req.asset,
          network: req.network,
          amount: money(req.amount),
          fee: money(0),
          balanceAfter: wallet.available,
          reference: `dep:${req.id}`,
          counterparty: req.txReference ?? null,
          note: "Deposit credited after administrative review",
          isSimulated: false,
        })
        .onConflictDoNothing({ target: [transactions.userId, transactions.reference] })
        .returning({ id: transactions.id });
      if (inserted.length === 0) {
        throw ApiError.conflict("ALREADY_CREDITED", "This deposit has already been credited to the wallet");
      }
    }

      await audit(
        {
          actorId: adminId,
          action: `deposit.review.${input.action}`,
          targetType: "deposit_request",
          targetId: req.id,
          metadata: { amount: req.amount, network: req.network, userId: req.userId, note: input.note },
          ip,
        },
        tx,
      );
      await notify(
        {
          userId: req.userId,
          type: "deposit_reviewed",
          title: nextStatus === "approved" ? `Deposit of ${req.amount} ${req.asset} credited` : "Deposit request rejected",
          body:
            nextStatus === "approved"
              ? "Your transfer was verified and the funds are now available in your wallet."
              : input.note ?? "Your deposit claim could not be verified. Contact support for details.",
          reference: `dep:${req.id}`,
        },
        tx,
      );
      return req;
  });
}

/**
 * Approve: reserved funds leave the wallet. Reject: reserved funds are
 * restored to available. Both transitions are guarded by the conditional
 * status flip plus a reserved-balance guard.
 */
export async function reviewWithdrawal(adminId: string, id: string, input: ReviewDecisionInput, ip: string) {
  const nextStatus = input.action === "approve" ? ("approved" as const) : ("rejected" as const);

  return db.transaction(async (tx) => {
    const [req] = await tx
      .update(withdrawalRequests)
      .set({ status: nextStatus, reviewedBy: adminId, reviewedAt: new Date(), reviewNote: input.note ?? null, updatedAt: new Date() })
      .where(and(eq(withdrawalRequests.id, id), eq(withdrawalRequests.status, "pending")))
      .returning();
    if (!req) {
      const [exists] = await tx.select({ status: withdrawalRequests.status }).from(withdrawalRequests).where(eq(withdrawalRequests.id, id)).limit(1);
      if (!exists) throw ApiError.notFound("Withdrawal request not found");
      throw ApiError.conflict("ALREADY_REVIEWED", `This request was already ${exists.status}`);
    }

    const total = add(req.amount, req.fee);

    if (nextStatus === "approved") {
      // Funds leave the platform — release the reservation.
      const [wallet] = await tx
        .update(wallets)
        .set({ reserved: numSql(sql`(${wallets.reserved}::numeric - ${total}::numeric)`), updatedAt: new Date() })
        .where(and(eq(wallets.userId, req.userId), sql`${wallets.reserved}::numeric >= ${total}::numeric`))
        .returning();
      if (!wallet) throw ApiError.conflict("RESERVE_MISMATCH", "Reserved balance is inconsistent — manual review required");

      await tx
        .update(transactions)
        .set({ status: "completed", balanceAfter: wallet.available })
        .where(and(eq(transactions.userId, req.userId), eq(transactions.reference, `wd:${req.id}`)));
    } else {
      // Rejection restores the full reservation to available funds.
      const [wallet] = await tx
        .update(wallets)
        .set({
          available: numSql(sql`(${wallets.available}::numeric + ${total}::numeric)`),
          reserved: numSql(sql`(${wallets.reserved}::numeric - ${total}::numeric)`),
          updatedAt: new Date(),
        })
        .where(and(eq(wallets.userId, req.userId), sql`${wallets.reserved}::numeric >= ${total}::numeric`))
        .returning();
      if (!wallet) throw ApiError.conflict("RESERVE_MISMATCH", "Reserved balance is inconsistent — manual review required");

      await tx
        .update(transactions)
        .set({ status: "rejected", balanceAfter: wallet.available })
        .where(and(eq(transactions.userId, req.userId), eq(transactions.reference, `wd:${req.id}`)));
    }

    await audit(
      {
        actorId: adminId,
        action: `withdrawal.review.${input.action}`,
        targetType: "withdrawal_request",
        targetId: req.id,
        metadata: { amount: req.amount, fee: req.fee, total, userId: req.userId, note: input.note },
        ip,
      },
      tx,
    );
    return req;
  });
}

/* ------------------------------------------------------------------ audits */

export async function listAuditLogs(query: AuditQueryInput) {
  const items = await db
    .select({ log: auditLogs, actorEmail: users.email })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(query.limit)
    .offset((query.page - 1) * query.limit);

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(auditLogs);

  return {
    items: items.map(({ log, actorEmail }) => ({ ...log, actorEmail })),
    total: Number(count ?? 0),
    page: query.page,
    limit: query.limit,
  };
}
