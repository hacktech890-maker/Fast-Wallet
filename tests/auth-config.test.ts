import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getEnv, resetEnvCache, EnvConfigError } from "../src/server/config/env";
import { extractPgCode, summarizeError } from "../src/server/utils/api";
import { authErrorMessage } from "../src/lib/api/error-messages";
import { ApiClientError } from "../src/lib/api/client";
import { registerFormSchema } from "../src/lib/schemas";

const KEYS = ["ADMIN_EMAIL", "ADMIN_PASSWORD", "COOKIE_SAME_SITE"] as const;
const saved: Record<string, string | undefined> = {};
beforeEach(() => { for (const k of KEYS) saved[k] = process.env[k]; resetEnvCache(); });
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } resetEnvCache(); });

test("blank ADMIN_* (copy of .env.example) means 'not configured', not a crash", () => {
  process.env.ADMIN_EMAIL = ""; process.env.ADMIN_PASSWORD = "";
  const e = getEnv();
  assert.equal(e.ADMIN_EMAIL, undefined);
  assert.equal(e.ADMIN_PASSWORD, undefined);
  assert.equal(e.ADMIN_CONFIG_ISSUE, undefined);
});

test("valid admin config is normalised (email lower-cased)", () => {
  process.env.ADMIN_EMAIL = "Owner@Example.COM"; process.env.ADMIN_PASSWORD = "longenough1";
  const e = getEnv();
  assert.equal(e.ADMIN_EMAIL, "owner@example.com");
  assert.equal(e.ADMIN_PASSWORD, "longenough1");
});

test("short admin password disables the credential but does not throw", () => {
  process.env.ADMIN_EMAIL = "owner@example.com"; process.env.ADMIN_PASSWORD = "short";
  const e = getEnv();
  assert.equal(e.ADMIN_PASSWORD, undefined);
  assert.match(e.ADMIN_CONFIG_ISSUE ?? "", /at least 8/);
  assert.equal((e.ADMIN_CONFIG_ISSUE ?? "").includes("short"), false, "must never echo the value");
});

test("ADMIN_PASSWORD without ADMIN_EMAIL is ignored with a reason", () => {
  delete process.env.ADMIN_EMAIL; process.env.ADMIN_PASSWORD = "longenough1";
  const e = getEnv();
  assert.equal(e.ADMIN_PASSWORD, undefined);
  assert.match(e.ADMIN_CONFIG_ISSUE ?? "", /ADMIN_EMAIL/);
});

test("other invalid env raises EnvConfigError naming the variable only", () => {
  process.env.COOKIE_SAME_SITE = "Sideways";
  assert.throws(() => getEnv(), (err: unknown) => err instanceof EnvConfigError && /COOKIE_SAME_SITE/.test(err.message) && !/Sideways/.test(err.message));
});

test("extractPgCode finds the SQLSTATE through wrapped driver errors", () => {
  const pg = Object.assign(new Error('relation "users" does not exist'), { code: "42P01" });
  const wrapped = Object.assign(new Error("Failed query: select ... params: a@b.c,$2b$10$hash"), { cause: pg });
  assert.equal(extractPgCode(wrapped), "42P01");
});

test("summarizeError never includes the SQL text or bound params (password hashes)", () => {
  const pg = Object.assign(new Error('duplicate key value'), { code: "23505" });
  const wrapped = Object.assign(new Error("Failed query: insert into users ... params: a@b.c,$2b$10$SECRETHASH"), { cause: pg });
  const out = summarizeError(wrapped);
  assert.match(out, /23505/);
  assert.equal(/SECRETHASH|insert into|params/.test(out), false);
});

test("schema/config errors get truthful UI messages, not 'invalid credentials'", () => {
  for (const code of ["DATABASE_SCHEMA_MISSING", "SERVER_MISCONFIGURED"]) {
    const m = authErrorMessage(new ApiClientError(code, "server words", 503));
    assert.equal(m, "server words");
    assert.equal(/invalid email/i.test(m), false);
  }
});

test("client register schema mirrors server rules (names, password length)", () => {
  const base = { firstName: "Ada", lastName: "Lovelace", email: "a@b.co", password: "Passw0rdA", confirmPassword: "Passw0rdA", acceptTerms: true };
  assert.equal(registerFormSchema.safeParse(base).success, true);
  assert.equal(registerFormSchema.safeParse({ ...base, firstName: "<b>" }).success, false);
  const long = "Aa1" + "x".repeat(70);
  assert.equal(registerFormSchema.safeParse({ ...base, password: long, confirmPassword: long }).success, false);
});
