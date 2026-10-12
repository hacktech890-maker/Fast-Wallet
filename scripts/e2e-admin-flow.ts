/**
 * Fast Wallet — integration test for the administrative control plane.
 *   npx tsx scripts/e2e-admin-flow.ts
 *
 * Exercises the real services against the real database and asserts:
 *   1. $1.00 credit lands exactly, with ledger + audit rows (exactly once)
 *   2. $0.50 credit works (sub-dollar precision)
 *   3. Debit with sufficient funds succeeds; insufficient funds is refused
 *   4. Duplicate (idempotent) adjustments never double-apply
 *   5. Concurrent adjustments stay consistent
 *   6. Admins cannot credit their own wallet
 *   7. High-value adjustments require a second approver (dual control)
 *   8. Failed operations roll back completely
 *   9. Session revocation + suspension cut off access
 *  10. Ledger reconciliation matches wallet balances
 */
import assert from "node:assert/strict";

async function main() {
  try {
    process.loadEnvFile(".env");
  } catch { /* env may be exported */ }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

  const { eq, and } = await import("drizzle-orm");
  const { db, pool } = await import("@/db");
  const { users, wallets, transactions, walletAdjustments, auditLogs, sessions } = await import("@/db/schema");
  const { registerUser } = await import("@/server/services/auth.service");
  const { createAdjustment, approveAdjustment, previewAdjustment } = await import("@/server/services/adjustment.service");
  const { setUserStatus, revokeUserSessions } = await import("@/server/services/admin.service");
  const { permissionsForRole } = await import("@/server/config/permissions");
  const { getSettings } = await import("@/server/services/settings.service");
  const { issueSession, getSessionWithUser } = await import("@/server/middleware/auth");

  const stamp = Date.now().toString(36);
  const ip = "127.0.0.1";
  const mk = (n: number) => `e2e-adj-${stamp}-${n}`;

  const balanceOf = async (userId: string) => {
    const [w] = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
    return w!.available;
  };

  /* ---------------------------------------------------------- fixtures */
  console.log("→ provisioning finance admin, second approver and customer …");
  const { user: customer } = await registerUser(
    { firstName: "Casey", lastName: "Customer", email: `cust-${stamp}@fastwallet.test`, password: "CustPass123!" },
    ip,
  );
  const { user: adminA } = await registerUser(
    { firstName: "Fin", lastName: "Admin", email: `fin-${stamp}@fastwallet.test`, password: "FinPass123!" },
    ip,
  );
  const { user: adminB } = await registerUser(
    { firstName: "Second", lastName: "Approver", email: `sec-${stamp}@fastwallet.test`, password: "SecPass123!" },
    ip,
  );
  await db.update(users).set({ role: "admin", adminRole: "finance_admin" }).where(eq(users.id, adminA.id));
  await db.update(users).set({ role: "admin", adminRole: "finance_admin" }).where(eq(users.id, adminB.id));

  type AdminCtx = Awaited<ReturnType<typeof import("@/server/middleware/auth").requirePermission>>;
  const ctxFor = async (id: string): Promise<AdminCtx> => {
    const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    const permissions = permissionsForRole("finance_admin");
    return { user: u!, role: "finance_admin", permissions, can: (p) => permissions.includes(p) };
  };
  const ctxA = await ctxFor(adminA.id);
  const ctxB = await ctxFor(adminB.id);

  assert.equal(await balanceOf(customer.id), "0.00000000");
  console.log("✓ customer starts at exactly 0");

  /* ------------------------------------------------ 1. the $1.00 credit */
  console.log("→ 1. crediting $1.00 …");
  const preview = await previewAdjustment(customer.id, "credit", "1.00");
  assert.equal(preview.currentBalance, "0.00000000");
  assert.equal(preview.resultingBalance, "1.00000000");

  const r1 = await createAdjustment(
    ctxA,
    { userId: customer.id, type: "credit", amount: "1.00", currency: "USDT", reason: "promotional_credit", fundingSource: "marketing_budget", idempotencyKey: mk(1) },
    ip,
  );
  assert.equal(r1.pendingApproval, false);
  assert.equal(await balanceOf(customer.id), "1.00000000");

  const ledger1 = await db.select().from(transactions).where(and(eq(transactions.userId, customer.id), eq(transactions.reference, r1.adjustment.reference)));
  assert.equal(ledger1.length, 1, "exactly one ledger row");
  assert.equal(ledger1[0]!.type, "admin_credit");
  assert.equal(ledger1[0]!.amount, "1.00000000");
  assert.equal(ledger1[0]!.balanceAfter, "1.00000000");

  const audit1 = await db.select().from(auditLogs).where(eq(auditLogs.targetId, r1.adjustment.id));
  assert.equal(audit1.length, 1, "exactly one audit row");
  assert.equal(audit1[0]!.action, "wallet.adjustment.credit");
  console.log("✓ $1.00 credited exactly once with ledger + audit");

  /* ---------------------------------------------- 2. sub-dollar credit */
  await createAdjustment(
    ctxA,
    { userId: customer.id, type: "credit", amount: "0.50", currency: "USDT", reason: "customer_support", fundingSource: "not_cash_backed", idempotencyKey: mk(2) },
    ip,
  );
  assert.equal(await balanceOf(customer.id), "1.50000000");
  console.log("✓ $0.50 credit → balance 1.50000000");

  /* ------------------------------------------------- 3. duplicate key */
  const dup = await createAdjustment(
    ctxA,
    { userId: customer.id, type: "credit", amount: "0.50", currency: "USDT", reason: "customer_support", fundingSource: "not_cash_backed", idempotencyKey: mk(2) },
    ip,
  );
  assert.equal(dup.duplicate, true);
  assert.equal(await balanceOf(customer.id), "1.50000000", "duplicate must not re-apply");
  console.log("✓ duplicate adjustment ignored");

  /* --------------------------------------------------------- 4. debit */
  await createAdjustment(
    ctxA,
    { userId: customer.id, type: "debit", amount: "0.50", currency: "USDT", reason: "correction", fundingSource: "not_cash_backed", idempotencyKey: mk(3) },
    ip,
  );
  assert.equal(await balanceOf(customer.id), "1.00000000");

  await assert.rejects(
    () =>
      createAdjustment(
        ctxA,
        { userId: customer.id, type: "debit", amount: "500", currency: "USDT", reason: "correction", fundingSource: "not_cash_backed", idempotencyKey: mk(4) },
        ip,
      ),
    /Insufficient/i,
    "over-debit must be refused",
  );
  assert.equal(await balanceOf(customer.id), "1.00000000", "failed debit rolled back completely");
  const orphan = await db.select().from(walletAdjustments).where(eq(walletAdjustments.idempotencyKey, mk(4)));
  assert.equal(orphan.length, 0, "no adjustment row left behind by the failed debit");
  console.log("✓ debit works; insufficient funds refused and fully rolled back");

  /* ------------------------------------------------ 5. self-adjustment */
  await assert.rejects(
    () =>
      createAdjustment(
        ctxA,
        { userId: adminA.id, type: "credit", amount: "100", currency: "USDT", reason: "other", fundingSource: "not_cash_backed", idempotencyKey: mk(5) },
        ip,
      ),
    /own wallet/i,
  );
  console.log("✓ admin cannot credit their own wallet");

  /* -------------------------------------------- 6. concurrent credits */
  const before = await balanceOf(customer.id);
  await Promise.all(
    [10, 11, 12, 13, 14].map((n) =>
      createAdjustment(
        ctxA,
        { userId: customer.id, type: "credit", amount: "1", currency: "USDT", reason: "promotional_credit", fundingSource: "marketing_budget", idempotencyKey: mk(n) },
        ip,
      ),
    ),
  );
  const after = await balanceOf(customer.id);
  assert.equal(Number(after).toFixed(8), (Number(before) + 5).toFixed(8), "all 5 concurrent credits applied exactly once");
  console.log(`✓ 5 concurrent credits: ${before} → ${after}`);

  /* ------------------------------------------------ 7. dual approval */
  const settings = await getSettings();
  const high = String(Number(settings.highValueAdjustmentThreshold) + 50);
  const pending = await createAdjustment(
    ctxA,
    { userId: customer.id, type: "credit", amount: high, currency: "USDT", reason: "approved_refund", fundingSource: "provider_settlement", idempotencyKey: mk(20) },
    ip,
  );
  assert.equal(pending.pendingApproval, true, "high-value must await approval");
  const heldBalance = await balanceOf(customer.id);
  assert.equal(heldBalance, after, "no money moves before approval");

  await assert.rejects(() => approveAdjustment(ctxA, pending.adjustment.id, ip), /second administrator/i);
  console.log("✓ requester cannot self-approve");

  await approveAdjustment(ctxB, pending.adjustment.id, ip);
  const approvedBalance = await balanceOf(customer.id);
  assert.equal(Number(approvedBalance).toFixed(2), (Number(heldBalance) + Number(high)).toFixed(2));
  const [appliedRow] = await db.select().from(walletAdjustments).where(eq(walletAdjustments.id, pending.adjustment.id));
  assert.equal(appliedRow!.status, "applied");
  assert.equal(appliedRow!.approvedBy, adminB.id);
  console.log("✓ second approver applied the high-value credit");

  /* ------------------------------------ 8. suspension + session revoke */
  const session = await issueSession(customer.id, ip);
  await revokeUserSessions(ctxA.user.id, customer.id, ip);
  const live = await db.select().from(sessions).where(and(eq(sessions.userId, customer.id), eq(sessions.tokenHash, (await import("@/server/utils/crypto")).hashToken(session.token))));
  assert.ok(live[0]?.invalidatedAt, "session revoked");

  await setUserStatus(ctxA.user.id, customer.id, { status: "suspended", reason: "integration test" }, ip);
  const [suspended] = await db.select().from(users).where(eq(users.id, customer.id));
  assert.equal(suspended!.status, "suspended");
  console.log("✓ sessions revoked and account suspended");
  void getSessionWithUser;

  /* ------------------------------------------- 9. ledger reconciliation */
  const rows = await db.select().from(transactions).where(eq(transactions.userId, customer.id));
  const ledgerSum = rows
    .filter((r) => r.status === "completed")
    .reduce((acc, r) => acc + Number(r.amount), 0);
  assert.equal(ledgerSum.toFixed(8), Number(await balanceOf(customer.id)).toFixed(8), "ledger must reconcile with the wallet");
  console.log(`✓ ledger reconciles with wallet balance (${ledgerSum.toFixed(2)})`);

  /* ------------------------------------------------------------ cleanup */
  await db.delete(users).where(eq(users.id, customer.id));
  await db.delete(users).where(eq(users.id, adminA.id));
  await db.delete(users).where(eq(users.id, adminB.id));
  console.log("\nALL ADMIN CONTROL-PLANE CHECKS PASSED");
  await pool?.end();
}

main().catch((err) => {
  console.error("E2E admin flow FAILED:", err);
  process.exit(1);
});
