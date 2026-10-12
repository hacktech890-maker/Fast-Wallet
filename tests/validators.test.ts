import { test } from "node:test";
import assert from "node:assert/strict";
import {
  registerSchema,
  loginSchema,
  depositCreateSchema,
  depositCheckoutSchema,
  withdrawalCreateSchema,
  transactionQuerySchema,
} from "../src/server/validators";

test("register schema enforces strong passwords and terms acceptance", () => {
  const ok = registerSchema.safeParse({
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
    password: "Password1",
    confirmPassword: "Password1",
    acceptTerms: true,
  });
  assert.equal(ok.success, true);

  const weak = registerSchema.safeParse({
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
    password: "password",
    confirmPassword: "password",
    acceptTerms: true,
  });
  assert.equal(weak.success, false);

  const noAck = registerSchema.safeParse({
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
    password: "Password1",
    confirmPassword: "Password1",
    acceptTerms: false,
  });
  assert.equal(noAck.success, false);

  // Role is never accepted from client payloads.
  const withRole = registerSchema.safeParse({
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
    password: "Password1",
    confirmPassword: "Password1",
    acceptTerms: true,
    role: "admin",
  });
  assert.equal(withRole.success, true);
  if (withRole.success) assert.equal("role" in withRole.data, false);
});

test("login schema lowercases email", () => {
  const res = loginSchema.parse({ email: "USER@EXAMPLE.COM", password: "x" });
  assert.equal(res.email, "user@example.com");
});

test("deposit schema: BEP20-only, required and normalized tx hash", () => {
  const HASH = "0x" + "ab12".repeat(16);
  const ok = depositCreateSchema.safeParse({
    amount: "150.5",
    txReference: HASH.toUpperCase().replace("0X", "0x"),
    idempotencyKey: "123e4567-e89b-12d3-a456-426614174000",
  });
  assert.equal(ok.success, true);
  if (ok.success) {
    assert.equal(ok.data.network, "BEP20", "network defaults to BEP20");
    assert.equal(ok.data.asset, "USDT");
    assert.equal(ok.data.txReference, HASH.toLowerCase(), "hash is lowercased for uniqueness");
  }

  // TRC20 must be rejected at the API boundary too
  const trc = depositCreateSchema.safeParse({
    network: "TRC20",
    amount: "100",
    txReference: HASH,
    idempotencyKey: "123e4567-e89b-12d3-a456-426614174000",
  });
  assert.equal(trc.success, false);

  // Missing or malformed hash must fail
  const noHash = depositCreateSchema.safeParse({ amount: "100", idempotencyKey: "123e4567-e89b-12d3-a456-426614174000" });
  assert.equal(noHash.success, false);
  const badHash = depositCreateSchema.safeParse({
    amount: "100",
    txReference: "0x1234",
    idempotencyKey: "123e4567-e89b-12d3-a456-426614174000",
  });
  assert.equal(badHash.success, false);

  // Minimums are NO LONGER hardcoded in the schema — they come from the
  // database-backed platform settings and are enforced in limits.service.
  // The schema therefore accepts any positive, well-formed amount.
  const small = depositCreateSchema.safeParse({
    amount: "1",
    txReference: HASH,
    idempotencyKey: "123e4567-e89b-12d3-a456-426614174000",
  });
  assert.equal(small.success, true, "$1 passes shape validation; policy min is applied server-side");

  const zero = depositCreateSchema.safeParse({
    amount: "0",
    txReference: HASH,
    idempotencyKey: "123e4567-e89b-12d3-a456-426614174000",
  });
  assert.equal(zero.success, false);
});

test("withdrawal schema: BEP20 only, optional address, presets allowed", () => {
  const KEY = "123e4567-e89b-12d3-a456-426614174000";

  // Address is optional — code-only transfers are valid.
  const codeOnly = withdrawalCreateSchema.safeParse({ amount: "5", idempotencyKey: KEY });
  assert.equal(codeOnly.success, true);
  if (codeOnly.success) assert.equal(codeOnly.data.network, "BEP20");

  // Every quick-select preset must validate.
  for (const preset of ["5", "10", "15", "50", "100", "200", "300"]) {
    const res = withdrawalCreateSchema.safeParse({ amount: preset, idempotencyKey: KEY });
    assert.equal(res.success, true, `preset ${preset} should be valid`);
  }
  // Policy minimums live in platform settings (limits.service), not the schema.
  assert.equal(withdrawalCreateSchema.safeParse({ amount: "0", idempotencyKey: KEY }).success, false);
  assert.equal(withdrawalCreateSchema.safeParse({ amount: "-5", idempotencyKey: KEY }).success, false);

  // A supplied address must be BEP20.
  const bepOk = withdrawalCreateSchema.safeParse({
    amount: "20",
    destinationAddress: "0x8ba1f109551bD432803012645Ac136ddd64DBA72",
    idempotencyKey: KEY,
  });
  assert.equal(bepOk.success, true);

  const tronAddr = withdrawalCreateSchema.safeParse({
    amount: "20",
    destinationAddress: "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE",
    idempotencyKey: KEY,
  });
  assert.equal(tronAddr.success, false, "TRON addresses are no longer accepted");

  // TRC20 network is rejected outright.
  const trc = withdrawalCreateSchema.safeParse({ network: "TRC20", amount: "20", idempotencyKey: KEY });
  assert.equal(trc.success, false);
});

test("checkout schema accepts a clean $20 deposit", () => {
  const ok = depositCheckoutSchema.safeParse({
    amount: "20",
    idempotencyKey: "123e4567-e89b-12d3-a456-426614174000",
  });
  assert.equal(ok.success, true);
  if (ok.success) assert.equal(ok.data.amount, "20");

  const bad = depositCheckoutSchema.safeParse({ amount: "-20", idempotencyKey: "x".repeat(12) });
  assert.equal(bad.success, false);
});

test("transaction query schema coerces strings with defaults", () => {
  const parsed = transactionQuerySchema.parse({ page: "2", limit: "25", order: "asc" });
  assert.equal(parsed.page, 2);
  assert.equal(parsed.limit, 25);
  assert.equal(parsed.sort, "date");
  assert.equal(parsed.order, "asc");

  const empty = transactionQuerySchema.parse({});
  assert.equal(empty.page, 1);
  assert.equal(empty.limit, 10);
});
