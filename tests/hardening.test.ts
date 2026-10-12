import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError, withRoute, ok, parseBody } from "../src/server/utils/api";
import { z } from "zod";

/**
 * Regression tests for the production hardening pass — security API contract,
 * sanitized dependency failures, and pg-code mapping. Database-free.
 */

const CTX = {};

/* ------------------------------------------------- error surface contract */

test("malformed JSON yields 400 INVALID_JSON with a clean message", async () => {
  const route = withRoute(async (req: Request) => {
    await parseBody(req, z.object({ a: z.string() }));
    return ok({});
  });
  const res = await route(new Request("http://x", { method: "POST", body: "{not json" }), CTX);
  assert.equal(res.status, 400);
  const body = (await res.json()) as { ok: boolean; error: { code: string; message: string } };
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "INVALID_JSON");
  assert.equal(/stack|at \w+ \(|ECONN|SELECT|INSERT/i.test(body.error.message), false, "must not leak internals");
});

test("Zod failures are 422, not 500", async () => {
  const route = withRoute(async (req: Request) => {
    await parseBody(req, z.object({ amount: z.string().regex(/^\d+$/) }));
    return ok({});
  });
  const res = await route(new Request("http://x", { method: "POST", body: '{"amount":"abc"}' }), CTX);
  assert.equal(res.status, 422);
  const body = (await res.json()) as { ok: boolean; error: { code: string } };
  assert.equal(body.error.code, "VALIDATION_ERROR");
});

test("ApiError subclasses map to the right HTTP codes", () => {
  for (const [err, status, code] of [
    [ApiError.unauthenticated(), 401, "UNAUTHENTICATED"],
    [ApiError.forbidden(), 403, "FORBIDDEN"],
    [ApiError.notFound(), 404, "NOT_FOUND"],
    [ApiError.conflict("X", "y"), 409, "X"],
  ] as const) {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, status);
    assert.equal(err.code, code);
  }
});

/* ------------------------------------------- dependency-failure handling */

test("missing DATABASE_URL surfaces 503, never a 401/500 misclassification", async () => {
  const route = withRoute(async () => {
    const err = new Error("Database is not configured. Set DATABASE_URL.");
    (err as { code?: string }).code = "DATABASE_NOT_CONFIGURED";
    throw err;
  });
  const res = await route(new Request("http://x", { method: "POST", body: "{}" }), CTX);
  assert.equal(res.status, 503);
  const body = (await res.json()) as { ok: boolean; error: { code: string } };
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "DATABASE_UNAVAILABLE");
});

test("connection-refused errors also map to 503", async () => {
  const route = withRoute(async () => {
    const err = new Error("connect ECONNREFUSED 127.0.0.1:5432");
    (err as { code?: string }).code = "ECONNREFUSED";
    throw err;
  });
  const res = await route(new Request("http://x", { method: "GET" }), CTX);
  assert.equal(res.status, 503);
});

test("unique-violation and bad-uuid map to 409 / 404 via pg codes", async () => {
  for (const [code, status] of [["23505", 409], ["22P02", 404]] as const) {
    const route = withRoute(async () => {
      const err = new Error("pg driver");
      (err as { code?: string }).code = code;
      throw err;
    });
    const res = await route(new Request("http://x", { method: "GET" }), CTX);
    assert.equal(res.status, Number(status), `${code} must map to ${status}`);
  }
});

test("unexpected errors are a sanitized 500 with no internals", async () => {
  const route = withRoute(async () => {
    throw new Error("SELECT * FROM users WHERE password='secret'");
  });
  const res = await route(new Request("http://x", { method: "GET" }), CTX);
  assert.equal(res.status, 500);
  const body = (await res.json()) as { ok: boolean; error: { message: string } };
  assert.equal(/SELECT|password|secret/i.test(body.error.message), false);
});

/* --------------------------------------------------------- the API shape */

test("success responses always use the { ok, data } envelope", async () => {
  const route = withRoute(() => ok({ hello: 1 }, 201));
  const res = await route(new Request("http://x", { method: "GET" }), CTX);
  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), { ok: true, data: { hello: 1 } });
});
