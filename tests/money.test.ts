import { test } from "node:test";
import assert from "node:assert/strict";
import {
  money,
  add,
  sub,
  gte,
  isValidAmountString,
  isValidBep20Address,
  isValidTrc20Address,
} from "../src/server/utils/money";

test("money normalizes to 8 decimals", () => {
  assert.equal(money("1"), "1.00000000");
  assert.equal(money("1.123456789"), "1.12345678"); // rounds down, never up
  assert.equal(money(42.5), "42.50000000");
});

test("add/sub avoid floating point errors", () => {
  // 0.1 + 0.2 === 0.30000000000000004 in float land — must not happen here.
  assert.equal(add("0.1", "0.2"), "0.30000000");
  assert.equal(sub("7001", "1"), "7000.00000000");
  assert.equal(add("0.00000001", "0.00000001"), "0.00000002");
});

test("comparisons are decimal-exact", () => {
  assert.equal(gte("100.00000001", "100"), true);
  assert.equal(gte("99.99999999", "100"), false);
});

test("amount string validation", () => {
  assert.equal(isValidAmountString("10"), true);
  assert.equal(isValidAmountString("10.12345678"), true);
  assert.equal(isValidAmountString("10.123456789"), false); // > 8 dp
  assert.equal(isValidAmountString("-5"), false);
  assert.equal(isValidAmountString("abc"), false);
});

test("network address validation", () => {
  assert.equal(isValidBep20Address("0x8ba1f109551bD432803012645Ac136ddd64DBA72"), true);
  assert.equal(isValidBep20Address("0x123"), false);
  assert.equal(isValidTrc20Address("TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE"), true);
  assert.equal(isValidTrc20Address("0x8ba1f109551bD432803012645Ac136ddd64DBA72"), false);
  assert.equal(isValidTrc20Address("TQn9"), false);
});
