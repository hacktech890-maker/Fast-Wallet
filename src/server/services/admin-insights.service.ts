import { and, asc, desc, eq, gte, ilike, isNull, lte, or, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  users,
  wallets,
  sessions,
  transactions,
  depositRequests,
  withdrawalRequests,
  walletAdjustments,
  auditLogs,
  paymentEvents,
  securityAlerts,
  loginAttempts,
  userNotes,
} from "@/db/schema";
import { ApiError } from "@/server/utils/api";
import { audit } from "@/server/utils/audit";
import { money } from "@/server/utils/money";
import { toCsv } from "@/server/utils/csv";
import { getSettings } from "@/server/services/settings.service";

/* ------------------------------------------------------------ date ranges */

export function resolveRange(input: { range: "day" | "week" | "month" | "custom"; from?: string; to?: string }) {
  const to = input.to ? new Date(`${input.to}T23:59:59.999Z`) : new Date();
  let from: Date;
  if (input.range === "custom" && input.from) {
    from = new Date(`${input.from}T00:00:00.000Z`);
  } else {
    const days = input.range === "day" ? 1 : input.range === "month" ? 30 : 7;
    from = new Date(to.getTime() - days * 86_400_000);
  }
  return { from, to };
}

/* ------------------------------------------------------------- dashboard */

/**
 * Platform dashboard. Every figure is a live database aggregate.
 *
 * Accounting note: `walletLiabilities` is money OWED TO USERS, never revenue.
 * Provider-confirmed inflows, on-chain verified deposits and manual
 * (non-cash-backed) adjustments are reported separately so the books can be
 * reconciled honestly.
 */
export async function getDashboardStats(range: { from: Date; to: Date }) {
  const inRange = (col: typeof transactions.createdAt) => and(gte(col, range.from), lte(col, range.to));

  const [userStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where ${users.status} = 'active')::int`,
      suspended: sql<number>`count(*) filter (where ${users.status} in ('suspended','blocked'))::int`,
      banned: sql<number>`count(*) filter (where ${users.status} = 'banned')::int`,
      admins: sql<number>`count(*) filter (where ${users.role} = 'admin')::int`,
      newInRange: sql<number>`count(*) filter (where ${users.createdAt} >= ${range.from.toISOString()})::int`,
    })
    .from(users);

  const [walletStats] = await db
    .select({
      available: sql<string>`coalesce(sum(${wallets.available}::numeric), 0)`,
      reserved: sql<string>`coalesce(sum(${wallets.reserved}::numeric), 0)`,
      funded: sql<number>`count(*) filter (where ${wallets.available}::numeric > 0)::int`,
    })
    .from(wallets);

  const [depositStats] = await db
    .select({
      pending: sql<number>`count(*) filter (where ${depositRequests.status} = 'pending')::int`,
      pendingSum: sql<string>`coalesce(sum(${depositRequests.amount}::numeric) filter (where ${depositRequests.status} = 'pending'), 0)`,
      approvedSum: sql<string>`coalesce(sum(${depositRequests.amount}::numeric) filter (where ${depositRequests.status} = 'approved'), 0)`,
      rejected: sql<number>`count(*) filter (where ${depositRequests.status} = 'rejected')::int`,
      cardSum: sql<string>`coalesce(sum(${depositRequests.amount}::numeric) filter (where ${depositRequests.status} = 'approved' and ${depositRequests.provider} = 'stripe'), 0)`,
      cryptoSum: sql<string>`coalesce(sum(${depositRequests.amount}::numeric) filter (where ${depositRequests.status} = 'approved' and ${depositRequests.provider} = 'manual'), 0)`,
    })
    .from(depositRequests);

  const [withdrawalStats] = await db
    .select({
      pending: sql<number>`count(*) filter (where ${withdrawalRequests.status} = 'pending')::int`,
      pendingSum: sql<string>`coalesce(sum((${withdrawalRequests.amount}::numeric + ${withdrawalRequests.fee}::numeric)) filter (where ${withdrawalRequests.status} = 'pending'), 0)`,
      approvedSum: sql<string>`coalesce(sum(${withdrawalRequests.amount}::numeric) filter (where ${withdrawalRequests.status} = 'approved'), 0)`,
      feesCollected: sql<string>`coalesce(sum(${withdrawalRequests.fee}::numeric) filter (where ${withdrawalRequests.status} = 'approved'), 0)`,
      rejected: sql<number>`count(*) filter (where ${withdrawalRequests.status} = 'rejected')::int`,
    })
    .from(withdrawalRequests);

  const [adjustmentStats] = await db
    .select({
      credits: sql<string>`coalesce(sum(${walletAdjustments.amount}::numeric) filter (where ${walletAdjustments.type} = 'credit' and ${walletAdjustments.status} = 'applied'), 0)`,
      debits: sql<string>`coalesce(sum(${walletAdjustments.amount}::numeric) filter (where ${walletAdjustments.type} = 'debit' and ${walletAdjustments.status} = 'applied'), 0)`,
      pendingApproval: sql<number>`count(*) filter (where ${walletAdjustments.status} = 'pending_approval')::int`,
      notCashBacked: sql<string>`coalesce(sum(${walletAdjustments.amount}::numeric) filter (where ${walletAdjustments.type} = 'credit' and ${walletAdjustments.status} = 'applied' and ${walletAdjustments.fundingSource} = 'not_cash_backed'), 0)`,
    })
    .from(walletAdjustments);

  const [paymentStats] = await db
    .select({
      events: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where ${paymentEvents.type} = 'checkout.session.completed')::int`,
      expired: sql<number>`count(*) filter (where ${paymentEvents.type} = 'checkout.session.expired')::int`,
    })
    .from(paymentEvents);

  const [alertStats] = await db
    .select({
      open: sql<number>`count(*) filter (where ${securityAlerts.status} != 'resolved')::int`,
      critical: sql<number>`count(*) filter (where ${securityAlerts.severity} in ('high','critical') and ${securityAlerts.status} != 'resolved')::int`,
    })
    .from(securityAlerts);

  const [failedLogins] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.success, false), gte(loginAttempts.createdAt, range.from)));

  // Daily series for charts (inflow = credits, outflow = debits).
  const series = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${transactions.createdAt}), 'YYYY-MM-DD')`,
      inflow: sql<string>`coalesce(sum(${transactions.amount}::numeric) filter (where ${transactions.amount}::numeric > 0 and ${transactions.status} = 'completed'), 0)`,
      outflow: sql<string>`coalesce(abs(sum(${transactions.amount}::numeric) filter (where ${transactions.amount}::numeric < 0 and ${transactions.status} = 'completed')), 0)`,
      count: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .where(inRange(transactions.createdAt))
    .groupBy(sql`date_trunc('day', ${transactions.createdAt})`)
    .orderBy(asc(sql`date_trunc('day', ${transactions.createdAt})`));

  const recentTransactions = await db
    .select({ tx: transactions, email: users.email })
    .from(transactions)
    .innerJoin(users, eq(users.id, transactions.userId))
    .orderBy(desc(transactions.createdAt))
    .limit(8);

  const recentAdminActions = await db
    .select({ log: auditLogs, actorEmail: users.email })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorId))
    .where(sql`${auditLogs.action} not in ('auth.login','auth.logout','auth.login.failed')`)
    .orderBy(desc(auditLogs.createdAt))
    .limit(8);

  const liabilities = money(
    (Number(walletStats?.available ?? 0) + Number(walletStats?.reserved ?? 0)).toFixed(8),
  );

  return {
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    users: {
      total: Number(userStats?.total ?? 0),
      active: Number(userStats?.active ?? 0),
      suspended: Number(userStats?.suspended ?? 0),
      banned: Number(userStats?.banned ?? 0),
      admins: Number(userStats?.admins ?? 0),
      newInRange: Number(userStats?.newInRange ?? 0),
    },
    liabilities: {
      /** Owed to users — NOT platform revenue. */
      total: liabilities,
      available: money(walletStats?.available ?? "0"),
      reserved: money(walletStats?.reserved ?? "0"),
      fundedWallets: Number(walletStats?.funded ?? 0),
      /** Portion of liabilities created by manual, non-cash-backed credits. */
      notCashBacked: money(adjustmentStats?.notCashBacked ?? "0"),
    },
    deposits: {
      pending: Number(depositStats?.pending ?? 0),
      pendingSum: money(depositStats?.pendingSum ?? "0"),
      approvedSum: money(depositStats?.approvedSum ?? "0"),
      rejected: Number(depositStats?.rejected ?? 0),
      cardConfirmed: money(depositStats?.cardSum ?? "0"),
      cryptoVerified: money(depositStats?.cryptoSum ?? "0"),
    },
    withdrawals: {
      pending: Number(withdrawalStats?.pending ?? 0),
      pendingSum: money(withdrawalStats?.pendingSum ?? "0"),
      approvedSum: money(withdrawalStats?.approvedSum ?? "0"),
      feesCollected: money(withdrawalStats?.feesCollected ?? "0"),
      rejected: Number(withdrawalStats?.rejected ?? 0),
    },
    adjustments: {
      credits: money(adjustmentStats?.credits ?? "0"),
      debits: money(adjustmentStats?.debits ?? "0"),
      pendingApproval: Number(adjustmentStats?.pendingApproval ?? 0),
    },
    payments: {
      events: Number(paymentStats?.events ?? 0),
      completed: Number(paymentStats?.completed ?? 0),
      expired: Number(paymentStats?.expired ?? 0),
    },
    security: {
      openAlerts: Number(alertStats?.open ?? 0),
      criticalAlerts: Number(alertStats?.critical ?? 0),
      failedLogins: Number(failedLogins?.count ?? 0),
    },
    series: series.map((s) => ({ date: s.day, inflow: Number(s.inflow), outflow: Number(s.outflow), count: s.count })),
    recentTransactions: recentTransactions.map(({ tx, email }) => ({ ...tx, userEmail: email })),
    recentAdminActions: recentAdminActions.map(({ log, actorEmail }) => ({ ...log, actorEmail })),
  };
}

/* ------------------------------------------------------------ user detail */

export async function getUserDetail(userId: string) {
  const [row] = await db
    .select({ user: users, available: wallets.available, reserved: wallets.reserved })
    .from(users)
    .leftJoin(wallets, eq(wallets.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) throw ApiError.notFound("User not found");

  const [deposits, withdrawals, txs, notes, activeSessions, failedLogins, adjustments] = await Promise.all([
    db.select().from(depositRequests).where(eq(depositRequests.userId, userId)).orderBy(desc(depositRequests.createdAt)).limit(10),
    db.select().from(withdrawalRequests).where(eq(withdrawalRequests.userId, userId)).orderBy(desc(withdrawalRequests.createdAt)).limit(10),
    db.select().from(transactions).where(eq(transactions.userId, userId)).orderBy(desc(transactions.createdAt)).limit(15),
    db
      .select({ note: userNotes, authorEmail: users.email })
      .from(userNotes)
      .leftJoin(users, eq(users.id, userNotes.authorId))
      .where(eq(userNotes.userId, userId))
      .orderBy(desc(userNotes.createdAt))
      .limit(50),
    db
      .select({ id: sessions.id, ip: sessions.ip, userAgent: sessions.userAgent, createdAt: sessions.createdAt, expiresAt: sessions.expiresAt })
      .from(sessions)
      .where(and(eq(sessions.userId, userId), isNull(sessions.invalidatedAt), gte(sessions.expiresAt, new Date())))
      .orderBy(desc(sessions.createdAt))
      .limit(10),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(loginAttempts)
      .where(and(eq(loginAttempts.userId, userId), eq(loginAttempts.success, false))),
    db.select().from(walletAdjustments).where(eq(walletAdjustments.userId, userId)).orderBy(desc(walletAdjustments.createdAt)).limit(10),
  ]);

  const { passwordHash: _ignored, ...safeUser } = row.user;
  return {
    user: {
      ...safeUser,
      available: money(row.available ?? "0"),
      reserved: money(row.reserved ?? "0"),
      emailVerified: Boolean(row.user.emailVerifiedAt),
    },
    deposits,
    withdrawals,
    transactions: txs,
    adjustments,
    notes: notes.map(({ note, authorEmail }) => ({ ...note, authorEmail })),
    sessions: activeSessions,
    failedLoginCount: Number(failedLogins[0]?.count ?? 0),
  };
}

/* -------------------------------------------------------- ledger explorer */

export interface LedgerQuery {
  page: number;
  limit: number;
  q?: string;
  userId?: string;
  type?: "deposit" | "withdrawal" | "adjustment" | "seed" | "admin_credit" | "admin_debit";
  status?: "pending" | "completed" | "rejected" | "cancelled";
  minAmount?: string;
  from?: string;
  to?: string;
}

function ledgerConditions(q: LedgerQuery) {
  const conds = [];
  if (q.userId) conds.push(eq(transactions.userId, q.userId));
  if (q.type) conds.push(eq(transactions.type, q.type));
  if (q.status) conds.push(eq(transactions.status, q.status));
  if (q.minAmount) conds.push(sql`abs(${transactions.amount}::numeric) >= ${q.minAmount}::numeric`);
  if (q.from) conds.push(gte(transactions.createdAt, new Date(`${q.from}T00:00:00.000Z`)));
  if (q.to) conds.push(lte(transactions.createdAt, new Date(`${q.to}T23:59:59.999Z`)));
  if (q.q) {
    const like = `%${q.q}%`;
    const search = or(
      ilike(transactions.reference, like),
      ilike(transactions.note, like),
      ilike(transactions.counterparty, like),
      ilike(users.email, like),
    );
    if (search) conds.push(search);
  }
  return conds.length ? and(...conds) : undefined;
}

export async function exploreLedger(q: LedgerQuery) {
  const where = ledgerConditions(q);

  const items = await db
    .select({ tx: transactions, email: users.email })
    .from(transactions)
    .innerJoin(users, eq(users.id, transactions.userId))
    .where(where)
    .orderBy(desc(transactions.createdAt))
    .limit(q.limit)
    .offset((q.page - 1) * q.limit);

  const [totals] = await db
    .select({
      count: sql<number>`count(*)::int`,
      credits: sql<string>`coalesce(sum(${transactions.amount}::numeric) filter (where ${transactions.amount}::numeric > 0), 0)`,
      debits: sql<string>`coalesce(abs(sum(${transactions.amount}::numeric) filter (where ${transactions.amount}::numeric < 0)), 0)`,
    })
    .from(transactions)
    .innerJoin(users, eq(users.id, transactions.userId))
    .where(where);

  // Reconciliation signal: references that appear more than once.
  const duplicates = await db
    .select({ reference: transactions.reference, count: sql<number>`count(*)::int` })
    .from(transactions)
    .groupBy(transactions.reference)
    .having(sql`count(*) > 1`)
    .limit(10);

  return {
    items: items.map(({ tx, email }) => ({ ...tx, userEmail: email })),
    total: Number(totals?.count ?? 0),
    page: q.page,
    limit: q.limit,
    totals: { credits: money(totals?.credits ?? "0"), debits: money(totals?.debits ?? "0") },
    anomalies: { duplicateReferences: duplicates },
  };
}

export async function exportLedgerCsv(q: LedgerQuery): Promise<string> {
  const where = ledgerConditions(q);
  const rows = await db
    .select({ tx: transactions, email: users.email })
    .from(transactions)
    .innerJoin(users, eq(users.id, transactions.userId))
    .where(where)
    .orderBy(desc(transactions.createdAt))
    .limit(5000);

  return toCsv(
    ["ledger_id", "created_at", "user_email", "type", "status", "asset", "network", "amount", "fee", "balance_after", "reference", "counterparty", "note"],
    rows.map(({ tx, email }) => [
      tx.id,
      tx.createdAt,
      email,
      tx.type,
      tx.status,
      tx.asset,
      tx.network,
      tx.amount,
      tx.fee,
      tx.balanceAfter,
      tx.reference,
      tx.counterparty,
      tx.note,
    ]),
  );
}

/* --------------------------------------------------------------- reports */

export async function buildReports(range: { from: Date; to: Date }) {
  const within = (col: AnyPgColumn) => and(gte(col, range.from), lte(col, range.to));

  const depositsByProvider = await db
    .select({
      provider: depositRequests.provider,
      status: depositRequests.status,
      count: sql<number>`count(*)::int`,
      total: sql<string>`coalesce(sum(${depositRequests.amount}::numeric), 0)`,
    })
    .from(depositRequests)
    .where(within(depositRequests.createdAt))
    .groupBy(depositRequests.provider, depositRequests.status);

  const withdrawalsByNetwork = await db
    .select({
      network: withdrawalRequests.network,
      status: withdrawalRequests.status,
      count: sql<number>`count(*)::int`,
      total: sql<string>`coalesce(sum(${withdrawalRequests.amount}::numeric), 0)`,
      fees: sql<string>`coalesce(sum(${withdrawalRequests.fee}::numeric), 0)`,
    })
    .from(withdrawalRequests)
    .where(within(withdrawalRequests.createdAt))
    .groupBy(withdrawalRequests.network, withdrawalRequests.status);

  const adjustmentsByReason = await db
    .select({
      type: walletAdjustments.type,
      reason: walletAdjustments.reason,
      fundingSource: walletAdjustments.fundingSource,
      count: sql<number>`count(*)::int`,
      total: sql<string>`coalesce(sum(${walletAdjustments.amount}::numeric), 0)`,
    })
    .from(walletAdjustments)
    .where(and(within(walletAdjustments.createdAt), eq(walletAdjustments.status, "applied")))
    .groupBy(walletAdjustments.type, walletAdjustments.reason, walletAdjustments.fundingSource);

  const daily = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${transactions.createdAt}), 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
      credits: sql<string>`coalesce(sum(${transactions.amount}::numeric) filter (where ${transactions.amount}::numeric > 0), 0)`,
      debits: sql<string>`coalesce(abs(sum(${transactions.amount}::numeric) filter (where ${transactions.amount}::numeric < 0)), 0)`,
    })
    .from(transactions)
    .where(within(transactions.createdAt))
    .groupBy(sql`date_trunc('day', ${transactions.createdAt})`)
    .orderBy(desc(sql`date_trunc('day', ${transactions.createdAt})`))
    .limit(60);

  const [liability] = await db
    .select({
      available: sql<string>`coalesce(sum(${wallets.available}::numeric), 0)`,
      reserved: sql<string>`coalesce(sum(${wallets.reserved}::numeric), 0)`,
    })
    .from(wallets);

  // Reconciliation: ledger sum per user must equal the wallet balance.
  const drift = await db
    .select({
      userId: wallets.userId,
      email: users.email,
      walletBalance: wallets.available,
      ledgerSum: sql<string>`coalesce((select sum(t.amount::numeric) from transactions t where t.user_id = ${wallets.userId} and t.status = 'completed'), 0)`,
    })
    .from(wallets)
    .innerJoin(users, eq(users.id, wallets.userId))
    .limit(500);

  const discrepancies = drift
    .map((d) => ({
      userId: d.userId,
      email: d.email,
      walletBalance: money(d.walletBalance),
      ledgerSum: money(d.ledgerSum),
      // Reserved funds legitimately sit outside `available`.
      difference: money((Number(d.ledgerSum) - Number(d.walletBalance)).toFixed(8)),
    }))
    .filter((d) => Math.abs(Number(d.difference)) > 0.00000001);

  return {
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    depositsByProvider: depositsByProvider.map((r) => ({ ...r, total: money(r.total) })),
    withdrawalsByNetwork: withdrawalsByNetwork.map((r) => ({ ...r, total: money(r.total), fees: money(r.fees) })),
    adjustmentsByReason: adjustmentsByReason.map((r) => ({ ...r, total: money(r.total) })),
    daily: daily.map((d) => ({ ...d, credits: money(d.credits), debits: money(d.debits) })),
    liabilities: {
      available: money(liability?.available ?? "0"),
      reserved: money(liability?.reserved ?? "0"),
      total: money(((Number(liability?.available ?? 0)) + Number(liability?.reserved ?? 0)).toFixed(8)),
    },
    reconciliation: {
      checked: drift.length,
      discrepancies: discrepancies.slice(0, 50),
      clean: discrepancies.length === 0,
    },
  };
}

/* -------------------------------------------------------- security alerts */

export async function listAlerts(params: { page: number; limit: number; status?: "open" | "investigating" | "resolved" }) {
  const where = params.status ? eq(securityAlerts.status, params.status) : undefined;
  const items = await db
    .select({ alert: securityAlerts, email: users.email })
    .from(securityAlerts)
    .leftJoin(users, eq(users.id, securityAlerts.userId))
    .where(where)
    .orderBy(desc(securityAlerts.createdAt))
    .limit(params.limit)
    .offset((params.page - 1) * params.limit);

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(securityAlerts).where(where);

  return {
    items: items.map(({ alert, email }) => ({ ...alert, userEmail: email })),
    total: Number(count ?? 0),
    page: params.page,
    limit: params.limit,
  };
}

export async function resolveAlert(
  adminId: string,
  alertId: string,
  input: { status: "open" | "investigating" | "resolved"; note?: string },
  ip: string,
) {
  const [updated] = await db
    .update(securityAlerts)
    .set({
      status: input.status,
      investigationNote: input.note ?? null,
      resolvedBy: input.status === "resolved" ? adminId : null,
      resolvedAt: input.status === "resolved" ? new Date() : null,
    })
    .where(eq(securityAlerts.id, alertId))
    .returning();
  if (!updated) throw ApiError.notFound("Alert not found");

  await audit({
    actorId: adminId,
    action: `security.alert.${input.status}`,
    targetType: "security_alert",
    targetId: alertId,
    metadata: { note: input.note },
    ip,
  });
  return updated;
}

/**
 * Detect suspicious patterns and persist them as alerts.
 * Thresholds come from settings; detection never confiscates funds or bans
 * anyone — it only raises an alert for a human to review.
 */
export async function scanForAnomalies(): Promise<{ created: number }> {
  const settings = await getSettings();
  const since = new Date(Date.now() - 3600_000);
  let created = 0;

  const bruteForce = await db
    .select({ email: loginAttempts.email, count: sql<number>`count(*)::int`, userId: sql<string | null>`max(${loginAttempts.userId}::text)` })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.success, false), gte(loginAttempts.createdAt, since)))
    .groupBy(loginAttempts.email)
    .having(sql`count(*) >= ${settings.failedLoginAlertThreshold}`);

  for (const row of bruteForce) {
    const [dupe] = await db
      .select({ id: securityAlerts.id })
      .from(securityAlerts)
      .where(and(eq(securityAlerts.type, "failed_logins"), eq(securityAlerts.summary, `Repeated failed logins for ${row.email}`), gte(securityAlerts.createdAt, since)))
      .limit(1);
    if (dupe) continue;
    await db.insert(securityAlerts).values({
      type: "failed_logins",
      severity: row.count >= settings.failedLoginAlertThreshold * 3 ? "high" : "medium",
      userId: row.userId ?? null,
      summary: `Repeated failed logins for ${row.email}`,
      details: { attempts: row.count, windowMinutes: 60, threshold: settings.failedLoginAlertThreshold },
    });
    created++;
  }

  // Duplicate ledger references should be impossible — flag loudly if seen.
  const dupRefs = await db
    .select({ reference: transactions.reference, count: sql<number>`count(*)::int` })
    .from(transactions)
    .groupBy(transactions.reference)
    .having(sql`count(*) > 1`)
    .limit(5);

  for (const row of dupRefs) {
    const [dupe] = await db
      .select({ id: securityAlerts.id })
      .from(securityAlerts)
      .where(and(eq(securityAlerts.type, "duplicate_ledger_reference"), eq(securityAlerts.summary, `Duplicate ledger reference ${row.reference}`)))
      .limit(1);
    if (dupe) continue;
    await db.insert(securityAlerts).values({
      type: "duplicate_ledger_reference",
      severity: "critical",
      summary: `Duplicate ledger reference ${row.reference}`,
      details: { occurrences: row.count },
    });
    created++;
  }

  return { created };
}
