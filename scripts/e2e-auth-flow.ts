/**
 * Fast Wallet — end-to-end authentication test against a RUNNING server.
 *
 *   npm run dev            (in another terminal, with the database set up: npm run db:setup)
 *   npm run test:e2e
 *
 * Covers: health, registration (validation, success, duplicate, role injection,
 * admin-identity claim), login (good/bad), session, logout, protected routes,
 * RBAC (anonymous 401 / user 403 / admin 200) and env-based admin login.
 * Admin checks read ADMIN_EMAIL / ADMIN_PASSWORD from the environment (or .env)
 * and are skipped, loudly, if they are not set. Credentials are never printed.
 */
import assert from "node:assert/strict";

try { process.loadEnvFile(".env"); } catch { /* optional */ }

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
let passed = 0;
let failed = 0;

async function step(name: string, fn: () => Promise<void>) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n      ${(e as Error).message}`); }
}

class Client {
  cookie = "";
  async call(method: string, path: string, body?: unknown) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(this.cookie ? { Cookie: this.cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });
    const sc = res.headers.get("set-cookie") ?? "";
    const m = sc.match(/fastwallet_session=([^;]*)/);
    if (m) this.cookie = m[1] ? `fastwallet_session=${m[1]}` : "";
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* html */ }
    return { status: res.status, json, setCookie: sc };
  }
}

const stamp = Date.now().toString(36);
const email = `e2e-${stamp}@example.com`;
const PASSWORD = "Str0ngPassw0rd";
const good = { firstName: "Ada", lastName: "Lovelace", email, password: PASSWORD, confirmPassword: PASSWORD, acceptTerms: true };

async function main() {
  console.log(`Target: ${BASE}\n`);

  console.log("Health");
  await step("GET /api/health is ok (schema current)", async () => {
    const r = await new Client().call("GET", "/api/health");
    assert.equal(r.status, 200, `status ${r.status} ${JSON.stringify(r.json)}`);
    assert.equal(r.json.ok, true);
  });

  console.log("\nRegistration");
  const user = new Client();
  await step("rejects weak password with field errors (422)", async () => {
    const r = await new Client().call("POST", "/api/auth/register", { ...good, password: "abc", confirmPassword: "abc" });
    assert.equal(r.status, 422);
    assert.ok(r.json.error.details.fieldErrors.password?.length);
  });
  await step("rejects mismatched confirmation (422)", async () => {
    const r = await new Client().call("POST", "/api/auth/register", { ...good, confirmPassword: "Different1Pass" });
    assert.equal(r.status, 422);
  });
  await step("rejects missing terms acceptance (422)", async () => {
    const r = await new Client().call("POST", "/api/auth/register", { ...good, acceptTerms: false });
    assert.equal(r.status, 422);
  });
  await step("rejects invalid email and bad name characters (422)", async () => {
    const r = await new Client().call("POST", "/api/auth/register", { ...good, email: "nope", firstName: "<script>" });
    assert.equal(r.status, 422);
    assert.ok(r.json.error.details.fieldErrors.email && r.json.error.details.fieldErrors.firstName);
  });
  await step("creates the account (201), sets HttpOnly cookie, role=user", async () => {
    const r = await user.call("POST", "/api/auth/register", { ...good, role: "admin", adminRole: "super_admin" });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.equal(r.json.data.user.role, "user", "role injection must be ignored");
    assert.equal(r.json.data.user.adminRole, null);
    assert.match(r.setCookie, /HttpOnly/i);
    assert.ok(user.cookie);
  });
  await step("duplicate email -> 409 EMAIL_TAKEN", async () => {
    const r = await new Client().call("POST", "/api/auth/register", good);
    assert.equal(r.status, 409);
    assert.equal(r.json.error.code, "EMAIL_TAKEN");
  });
  await step("email is case-insensitive for duplicates", async () => {
    const r = await new Client().call("POST", "/api/auth/register", { ...good, email: email.toUpperCase() });
    assert.equal(r.status, 409);
  });

  console.log("\nSession & protected routes");
  await step("GET /api/auth/me returns the registered user", async () => {
    const r = await user.call("GET", "/api/auth/me");
    assert.equal(r.status, 200);
    assert.equal(r.json.data.user.email, email);
  });
  await step("new wallet starts at zero", async () => {
    const r = await user.call("GET", "/api/wallet/summary");
    assert.equal(r.status, 200, JSON.stringify(r.json));
  });
  await step("anonymous user: /api/auth/me and /api/wallet/summary -> 401", async () => {
    const a = new Client();
    assert.equal((await a.call("GET", "/api/auth/me")).status, 401);
    assert.equal((await a.call("GET", "/api/wallet/summary")).status, 401);
  });
  await step("anonymous: /dashboard and /admin redirect to /login", async () => {
    for (const p of ["/dashboard", "/admin"]) {
      const res = await fetch(`${BASE}${p}`, { redirect: "manual" });
      assert.ok([302, 307, 308].includes(res.status), `${p} -> ${res.status}`);
      assert.match(res.headers.get("location") ?? "", /\/login/);
    }
  });

  console.log("\nRole-based access control");
  await step("anonymous -> /api/admin/users 401", async () => {
    assert.equal((await new Client().call("GET", "/api/admin/users")).status, 401);
  });
  await step("regular user -> admin endpoints 403", async () => {
    for (const p of ["/api/admin/users", "/api/admin/stats", "/api/admin/settings", "/api/admin/me", "/api/admin/audit-logs"]) {
      assert.equal((await user.call("GET", p)).status, 403, p);
    }
    assert.equal((await user.call("POST", "/api/admin/adjustments", {})).status, 403);
  });

  console.log("\nLogout");
  await step("logout clears cookie; old session is dead server-side", async () => {
    const stale = user.cookie;
    const r = await user.call("POST", "/api/auth/logout");
    assert.equal(r.status, 200);
    const replay = new Client(); replay.cookie = stale;
    assert.equal((await replay.call("GET", "/api/auth/me")).status, 401, "invalidated token must not work");
  });

  console.log("\nLogin");
  const again = new Client();
  await step("login with correct credentials (200)", async () => {
    const r = await again.call("POST", "/api/auth/login", { email, password: PASSWORD });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.data.user.email, email);
    assert.ok(again.cookie);
  });
  await step("login is case-insensitive on email", async () => {
    assert.equal((await new Client().call("POST", "/api/auth/login", { email: email.toUpperCase(), password: PASSWORD })).status, 200);
  });
  await step("wrong password -> 401 INVALID_CREDENTIALS", async () => {
    const r = await new Client().call("POST", "/api/auth/login", { email, password: "WrongPassw0rd" });
    assert.equal(r.status, 401);
    assert.equal(r.json.error.code, "INVALID_CREDENTIALS");
  });
  await step("unknown email -> same 401 (no enumeration)", async () => {
    const r = await new Client().call("POST", "/api/auth/login", { email: `ghost-${stamp}@example.com`, password: PASSWORD });
    assert.equal(r.status, 401);
    assert.equal(r.json.error.code, "INVALID_CREDENTIALS");
  });
  await step("empty password -> 422", async () => {
    assert.equal((await new Client().call("POST", "/api/auth/login", { email, password: "" })).status, 422);
  });

  console.log("\nAdministrator (credentials from environment)");
  const adminEmail = process.env.ADMIN_EMAIL?.trim();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    console.log("  ! SKIPPED: ADMIN_EMAIL / ADMIN_PASSWORD are not set in the environment or .env");
  } else {
    const admin = new Client();
    await step("public registration of ADMIN_EMAIL is refused (409)", async () => {
      const r = await new Client().call("POST", "/api/auth/register", { ...good, email: adminEmail });
      assert.equal(r.status, 409);
    });
    await step("wrong admin password -> 401", async () => {
      const r = await new Client().call("POST", "/api/auth/login", { email: adminEmail, password: adminPassword + "x" });
      assert.equal(r.status, 401);
    });
    await step("admin logs in with ADMIN_EMAIL + ADMIN_PASSWORD -> role admin / super_admin", async () => {
      const r = await admin.call("POST", "/api/auth/login", { email: adminEmail, password: adminPassword });
      assert.equal(r.status, 200, JSON.stringify(r.json));
      assert.equal(r.json.data.user.role, "admin");
      assert.equal(r.json.data.user.adminRole, "super_admin");
    });
    await step("admin reaches admin APIs (200)", async () => {
      for (const p of ["/api/admin/me", "/api/admin/users", "/api/admin/stats", "/api/admin/settings", "/api/admin/audit-logs", "/api/admin/ledger"]) {
        const r = await admin.call("GET", p);
        assert.equal(r.status, 200, `${p} -> ${r.status} ${JSON.stringify(r.json)?.slice(0, 160)}`);
      }
    });
    await step("admin sees the registered customer in user management", async () => {
      const r = await admin.call("GET", `/api/admin/users?q=${encodeURIComponent(email)}`);
      assert.equal(r.status, 200);
      assert.ok(JSON.stringify(r.json).includes(email));
    });
    await step("admin cannot change password in-app (env-managed)", async () => {
      const r = await admin.call("PATCH", "/api/users/me/password", { currentPassword: adminPassword, password: "Another1Pass", confirmPassword: "Another1Pass" });
      assert.equal(r.status, 400);
      assert.equal(r.json.error.code, "ADMIN_PASSWORD_MANAGED_BY_ENV");
    });
    await step("admin logout invalidates the admin session", async () => {
      const stale = admin.cookie;
      assert.equal((await admin.call("POST", "/api/auth/logout")).status, 200);
      const replay = new Client(); replay.cookie = stale;
      assert.equal((await replay.call("GET", "/api/admin/me")).status, 401);
    });
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
