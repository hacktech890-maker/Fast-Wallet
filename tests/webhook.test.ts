import { test } from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";

/**
 * Signature round-trip for the webhook verification path.
 * Uses the SDK's own test-header generator against a throwaway secret —
 * no live Stripe account required, and proves that:
 *  1. correctly-signed payloads verify, and
 *  2. tampered payloads / wrong secrets are rejected.
 */
const SECRET = "whsec_test_secret_for_unit_tests_only";
const stripe = new Stripe("sk_test_unit_placeholder");

test("webhook signature verifies for authentic payloads", () => {
  const payload = JSON.stringify({
    id: "evt_unit_1",
    object: "event",
    type: "checkout.session.completed",
    data: { object: { id: "cs_unit_1", payment_status: "paid", amount_total: 2000, currency: "usd" } },
  });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
  const event = stripe.webhooks.constructEvent(payload, header, SECRET);
  assert.equal(event.id, "evt_unit_1");
  assert.equal(event.type, "checkout.session.completed");
});

test("tampered payload fails verification", () => {
  const payload = JSON.stringify({ id: "evt_unit_2", object: "event", type: "checkout.session.completed", data: { object: {} } });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
  const tampered = payload.replace("completed", "expired");
  assert.throws(() => stripe.webhooks.constructEvent(tampered, header, SECRET), /signature/i);
});

test("wrong secret fails verification", () => {
  const payload = JSON.stringify({ id: "evt_unit_3", object: "event", type: "x", data: { object: {} } });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
  assert.throws(() => stripe.webhooks.constructEvent(payload, header, "whsec_other"), /signature/i);
});
