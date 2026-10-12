/**
 * Fast Wallet — end-to-end verification of the verified-deposit payment flow.
 *
 *   npx tsx scripts/e2e-payment-flow.ts
 *
 * Exercises the exact production credit path (`processStripeEvent`) against a
 * real database and asserts:
 *   1. A verified $20 payment credits the wallet by EXACTLY $20 (once).
 *   2. Replayed webhooks never double-credit.
 *   3. Amount-manipulated sessions are rejected without crediting.
 *   4. Expired / unpaid sessions never credit.
 *   5. Newly registered users always start at 0 with role `user`.
 */
import assert from "node:assert/strict";

async function main() {
  try {
    process.loadEnvFile(".env");
  } catch { /* env may be exported */ }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

  const bcrypt = (await import("bcryptjs")).default;
  const { eq, and } = await import("drizzle-orm");
  const { db, pool } = await import("@/db");
  const { users, wallets, depositRequests, transactions, paymentEvents } = await import("@/db/schema");
  const { money } = await import("@/server/utils/money");
  const { processStripeEvent } = await import("@/server/services/payment.service");
  const { registerUser } = await import("@/server/services/auth.service");
  const { publicUser } = await import("@/server/services/auth.service");

  type FakeSession = {
    id: string;
    amount_total: number | null;
    currency: string;
    payment_status: string;
    livemode: boolean;
    metadata: Record<string, string> | null;
  };
  const makeEvent = (type: string, session: FakeSession, eventId: string) =>
    ({
      id: eventId,
      object: "event",
      type,
      livemode: false,
      data: { object: { ...session, object: "checkout.session" } },
    }) as unknown as import("stripe").Stripe.Event;

  const stamp = Date.now().toString(36);
  const email = `flow-${stamp}@fastwallet.test`;
  console.log(`→ 1. registering ${email} …`);

  const { user } = await registerUser(
    { firstName: "Flow", lastName: "Test", email, password: "FlowTest123!" },
    "127.0.0.1",
  );
  const me = publicUser((await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0]!);
  assert.equal(me.role, "user", "new accounts must be role user");
  let [w] = await db.select().from(wallets).where(eq(wallets.userId, user.id)).limit(1);
  assert.equal(w!.available, "0.00000000", "new wallets start at exactly zero");
  assert.equal(w!.isSimulated, false, "production wallets are not simulated");
  console.log("✓ new user: role=user, balance=0");

  /** A fake-registered Stripe deposit request, as the checkout route would create. */
  async function newStripeRequest(amount: string, key: string, sessionId: string) {
    const [r] = await db
      .insert(depositRequests)
      .values({
        userId: user.id,
        amount: money(amount),
        network: null,
        depositAddress: null,
        provider: "stripe",
        currency: "usd",
        providerRef: sessionId,
        checkoutUrl: "https://checkout.stripe.com/test",
        idempotencyKey: key,
      })
      .returning();
    return r!;
  }

  const sessionOf = (id: string, cents: number, status = "paid", meta: string | null = null): FakeSession => ({
    id,
    amount_total: cents,
    currency: "usd",
    payment_status: status,
    livemode: false,
    metadata: meta ? { deposit_request_id: meta } : null,
  });

  const balance = async () => {
    const [row] = await db.select().from(wallets).where(eq(wallets.userId, user.id)).limit(1);
    return row!.available;
  };

  // ── 2. The exact $20 deposit ──────────────────────────────────────────────
  console.log("→ 2. verified $20 payment …");
  const req1 = await newStripeRequest("20", `fw-e2e-${stamp}-1`, `cs_t20_${stamp}`);
  let out = await processStripeEvent(makeEvent("checkout.session.completed", sessionOf(`cs_t20_${stamp}`, 2000, "paid", req1.id), `evt_t20_${stamp}`));
  assert.equal(out.outcome, "credited");
  assert.equal(await balance(), "20.00000000", "$20 payment must credit exactly $20");
  const [ledger] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.userId, user.id), eq(transactions.reference, `stripe:cs_t20_${stamp}`)))
    .limit(1);
  assert.ok(ledger, "ledger transaction exists");
  assert.equal(ledger.amount, "20.00000000");
  assert.equal(ledger.balanceAfter, "20.00000000");
  console.log("✓ credited exactly 20.00000000 with unique ledger reference");

  // ── 3. Replay attacks ─────────────────────────────────────────────────────
  console.log("→ 3. replaying the same webhook twice …");
  out = await processStripeEvent(makeEvent("checkout.session.completed", sessionOf(`cs_t20_${stamp}`, 2000, "paid", req1.id), `evt_t20_${stamp}`));
  assert.equal(out.outcome, "duplicate", "same event id must be a replay");
  const out2 = await processStripeEvent(makeEvent("checkout.session.completed", sessionOf(`cs_t20_${stamp}`, 2000, "paid", req1.id), `evt_t20b_${stamp}`));
  assert.equal(out2.outcome, "duplicate", "same session under a NEW event id must still not double-credit");
  assert.equal(await balance(), "20.00000000", "replays must never change the balance");
  console.log("✓ replays blocked (event-level + status-flip + unique reference)");

  // ── 4. Amount manipulation ────────────────────────────────────────────────
  console.log("→ 4. manipulated session (charged $25 for a $20 request) …");
  await newStripeRequest("20", `fw-e2e-${stamp}-2`, `cs_cheat_${stamp}`);
  out = await processStripeEvent(makeEvent("checkout.session.completed", sessionOf(`cs_cheat_${stamp}`, 2500), `evt_cheat_${stamp}`));
  assert.equal(out.outcome, "rejected");
  assert.equal(await balance(), "20.00000000", "manipulated payments must not credit");
  console.log("✓ mismatch rejected, no credit");

  // ── 5. Expired checkout ───────────────────────────────────────────────────
  console.log("→ 5. expired checkout session …");
  await newStripeRequest("50", `fw-e2e-${stamp}-3`, `cs_exp_${stamp}`);
  out = await processStripeEvent(makeEvent("checkout.session.expired", sessionOf(`cs_exp_${stamp}`, 5000, "unpaid"), `evt_exp_${stamp}`));
  assert.equal(out.outcome, "cancelled");
  assert.equal(await balance(), "20.00000000");
  console.log("✓ expired session closed without credit");

  // ── 6. Unpaid async session ───────────────────────────────────────────────
  console.log("→ 6. async session still unpaid …");
  await newStripeRequest("75", `fw-e2e-${stamp}-4`, `cs_async_${stamp}`);
  out = await processStripeEvent(makeEvent("checkout.session.completed", sessionOf(`cs_async_${stamp}`, 7500, "unpaid"), `evt_async_${stamp}`));
  assert.equal(out.outcome, "awaiting_payment");
  assert.equal(await balance(), "20.00000000");
  console.log("✓ unpaid sessions never credit");

  // ── 7. Unmatched session (noise from other Stripe products) ───────────────
  out = await processStripeEvent(makeEvent("checkout.session.completed", sessionOf(`cs_other_${stamp}`, 99900), `evt_other_${stamp}`));
  assert.equal(out.outcome, "unmatched");
  assert.equal(await balance(), "20.00000000");
  console.log("✓ unmatched sessions logged, no credit");

  const [pe] = await db.select().from(paymentEvents).limit(1);
  assert.ok(pe, "payment event ledger is written");
  console.log(`\nALL PAYMENT-FLOW CHECKS PASSED — final balance: ${await balance()} USDT`);

  // Cleanup test user so the database stays pristine.
  await db.delete(users).where(eq(users.id, user.id));
  await pool?.end();
}

main().catch((err) => {
  console.error("E2E payment flow FAILED:", err);
  process.exit(1);
});
