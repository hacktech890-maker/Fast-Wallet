import { test } from "node:test";
import assert from "node:assert/strict";
import { authErrorMessage } from "../src/lib/api/error-messages";
import { ApiClientError } from "../src/lib/api/client";

/**
 * Regression: a 500-side failure must NEVER be displayed to the user as
 * "invalid email or password" — that misdiagnoses outages as credential
 * problems and is how the login 500s were silently swallowed before.
 */

test("invalid credentials stays human and specific", () => {
  assert.equal(
    authErrorMessage(new ApiClientError("INVALID_CREDENTIALS", "x", 401)),
    "Invalid email or password. Please try again.",
  );
});

test("dependency outage is described as outage, not bad credentials", () => {
  const msg = authErrorMessage(new ApiClientError("DATABASE_UNAVAILABLE", "x", 503));
  assert.equal(/temporarily unavailable/i.test(msg), true);
  assert.equal(/invalid email/i.test(msg), false, "500 must not masquerade as invalid login");
});

test("generic internal error never claims credentials were wrong", () => {
  const msg = authErrorMessage(new ApiClientError("INTERNAL", "x", 500));
  assert.equal(/invalid email/i.test(msg), false);
});

test("network failure is honest", () => {
  const msg = authErrorMessage(new ApiClientError("NETWORK", "x", 0));
  assert.equal(/cannot reach/i.test(msg), true);
});

test("rate limit and blocked accounts keep the server-provided message", () => {
  assert.equal(
    authErrorMessage(new ApiClientError("RATE_LIMITED", "Too many attempts", 429)),
    "Too many attempts",
  );
  assert.equal(
    authErrorMessage(new ApiClientError("ACCOUNT_BLOCKED", "Suspended account", 403)),
    "Suspended account",
  );
});

test("unknown errors fall back to a safe generic message", () => {
  assert.equal(authErrorMessage(new Error("SELECT * FROM secrets")), "Cannot reach the server. Please retry.");
});
