import { test } from "node:test";
import assert from "node:assert/strict";
import { ROLE_PERMISSIONS, permissionsForRole, resolveAdminRole, roleHasPermission } from "../src/server/config/permissions";

test("finance admin can adjust wallets, support admin cannot", () => {
  assert.equal(roleHasPermission("finance_admin", "wallet.adjust"), true);
  assert.equal(roleHasPermission("support_admin", "wallet.adjust"), false);
  assert.equal(roleHasPermission("support_admin", "wallet.adjust.approve"), false);
});

test("read-only auditor cannot modify anything financial", () => {
  const perms = permissionsForRole("auditor");
  for (const forbidden of ["wallet.adjust", "deposits.review", "withdrawals.review", "settings.manage", "users.manage", "users.delete"]) {
    assert.equal(perms.includes(forbidden as never), false, `${forbidden} must not be granted to auditor`);
  }
  assert.equal(perms.includes("ledger.view"), true);
});

test("only super admin may manage settings and delete users", () => {
  assert.equal(roleHasPermission("super_admin", "settings.manage"), true);
  assert.equal(roleHasPermission("super_admin", "users.delete"), true);
  assert.equal(roleHasPermission("finance_admin", "settings.manage"), false);
  assert.equal(roleHasPermission("finance_admin", "users.delete"), false);
  assert.equal(roleHasPermission("compliance_reviewer", "users.delete"), false);
});

test("csv export permissions are explicit", () => {
  assert.equal(roleHasPermission("compliance_reviewer", "ledger.export"), true);
  assert.equal(roleHasPermission("auditor", "ledger.export"), false);
  assert.equal(roleHasPermission("support_admin", "users.export"), false);
  assert.equal(roleHasPermission("super_admin", "users.export"), true);
});

test("no permissions without an admin role (deny by default)", () => {
  assert.deepEqual(permissionsForRole(null), []);
  assert.deepEqual(permissionsForRole(undefined), []);
  assert.equal(roleHasPermission(null, "dashboard.view"), false);
});

test("ADMIN_EMAIL resolves to super admin; ordinary users never do", () => {
  const env = "owner@fastwallet.in";
  assert.equal(resolveAdminRole({ email: "owner@fastwallet.in", role: "admin", adminRole: null }, env), "super_admin");
  // Case-insensitive match
  assert.equal(resolveAdminRole({ email: "Owner@FastWallet.in", role: "admin", adminRole: null }, env), "super_admin");
  // A user row claiming the admin role but not being ADMIN_EMAIL keeps its granted scope only
  assert.equal(resolveAdminRole({ email: "mallory@x.com", role: "admin", adminRole: "support_admin" }, env), "support_admin");
  // role=user can never resolve to an admin scope, even with adminRole set
  assert.equal(resolveAdminRole({ email: "mallory@x.com", role: "user", adminRole: "super_admin" }, env), null);
  // Unknown admin with no granted scope gets nothing
  assert.equal(resolveAdminRole({ email: "nobody@x.com", role: "admin", adminRole: null }, env), null);
});

test("every role maps to a known permission set", () => {
  for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
    assert.ok(perms.length > 0, `${role} should have permissions`);
    assert.ok(perms.includes("dashboard.view"), `${role} should see the dashboard`);
  }
});
