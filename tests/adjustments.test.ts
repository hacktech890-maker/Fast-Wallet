import { test } from "node:test";
import assert from "node:assert/strict";
import { adjustmentCreateSchema, depositCheckoutSchema, settingsUpdateSchema } from "../src/server/validators";
import { settingsSchema, DEFAULT_SETTINGS } from "../src/server/config/settings-schema";
import { add, sub, money } from "../src/server/utils/money";

const KEY = "123e4567-e89b-12d3-a456-426614174000";
const USER = "6f1d2b6a-2a6f-4e35-9a2c-4c7f2a9a1b11";

/* ------------------------------------------------- amount acceptance ---- */

test("admin credit accepts $1.00 and $0.50", () => {
  for (const amount of ["1", "1.00", "0.50", "0.01"]) {
    const res = adjustmentCreateSchema.safeParse({
      userId: USER,
      type: "credit",
      amount,
      reason: "promotional_credit",
      idempotencyKey: KEY,
    });
    assert.equal(res.success, true, `${amount} should be accepted`);
    if (res.success) {
      assert.equal(res.data.currency, "USDT");
      assert.equal(res.data.fundingSource, "not_cash_backed");
    }
  }
});

test("zero, negative and malformed amounts are rejected", () => {
  for (const amount of ["0", "0.00", "-1", "-0.5", "abc", "", "1.123456789", "1e5"]) {
    const res = adjustmentCreateSchema.safeParse({
      userId: USER,
      type: "credit",
      amount,
      reason: "correction",
      idempotencyKey: KEY,
    });
    assert.equal(res.success, false, `${amount} must be rejected`);
  }
});

test("adjustment requires a known reason and a valid user id", () => {
  assert.equal(
    adjustmentCreateSchema.safeParse({ userId: "not-a-uuid", type: "credit", amount: "1", reason: "correction", idempotencyKey: KEY }).success,
    false,
  );
  assert.equal(
    adjustmentCreateSchema.safeParse({ userId: USER, type: "credit", amount: "1", reason: "bogus_reason", idempotencyKey: KEY }).success,
    false,
  );
  // Idempotency key is mandatory — protects against duplicate submissions.
  assert.equal(adjustmentCreateSchema.safeParse({ userId: USER, type: "credit", amount: "1", reason: "correction" }).success, false);
});

/* ------------------------------------------------- balance arithmetic --- */

test("credit and debit arithmetic is exact (no float drift)", () => {
  // 0.1 + 0.2 must be exactly 0.30000000
  assert.equal(add("0.1", "0.2"), "0.30000000");
  // A $1.00 credit on a $0 wallet yields exactly 1.00000000
  assert.equal(add("0.00000000", "1.00"), "1.00000000");
  // A $0.50 credit then $0.50 debit returns to zero
  assert.equal(sub(add("0", "0.50"), "0.50"), "0.00000000");
  assert.equal(money("20"), "20.00000000");
});

/* --------------------------------------------------- deposit minimums --- */

test("no hardcoded $8/$10 minimum remains — $1 deposits validate", () => {
  for (const amount of ["1", "1.00", "2.50", "5"]) {
    const res = depositCheckoutSchema.safeParse({ amount, idempotencyKey: KEY });
    assert.equal(res.success, true, `${amount} must pass shape validation`);
  }
  // Still rejects nonsense
  assert.equal(depositCheckoutSchema.safeParse({ amount: "0", idempotencyKey: KEY }).success, false);
  assert.equal(depositCheckoutSchema.safeParse({ amount: "-5", idempotencyKey: KEY }).success, false);
});

test("default platform minimum deposit is 1 (configurable, not hardcoded)", () => {
  assert.equal(DEFAULT_SETTINGS.minDeposit, "1");
  assert.equal(DEFAULT_SETTINGS.depositsEnabled, true);
  // Operators may lower or raise it at runtime.
  const lowered = settingsSchema.parse({ ...DEFAULT_SETTINGS, minDeposit: "0.50" });
  assert.equal(lowered.minDeposit, "0.50");
});

/* ------------------------------------------------------------ settings -- */

test("settings updates require a reason", () => {
  assert.equal(settingsUpdateSchema.safeParse({ settings: { minDeposit: "2" } }).success, false);
  assert.equal(
    settingsUpdateSchema.safeParse({ reason: "promo launch", settings: { minDeposit: "2" } }).success,
    true,
  );
});

test("dual approval is off by default (full admin control)", () => {
  assert.equal(DEFAULT_SETTINGS.dualApprovalEnabled, false);
  assert.equal(DEFAULT_SETTINGS.allowNegativeBalance, false);
  assert.equal(DEFAULT_SETTINGS.highValueAdjustmentThreshold, "1000");
});

test("settings schema rejects malformed amounts", () => {
  assert.throws(() => settingsSchema.parse({ ...DEFAULT_SETTINGS, minDeposit: "abc" }));
  assert.throws(() => settingsSchema.parse({ ...DEFAULT_SETTINGS, withdrawalFee: "-1" }));
});
