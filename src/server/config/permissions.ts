import type { AdminRole } from "@/db/schema";

/**
 * Server-enforced permission model. Every protected route names the exact
 * permission it needs; roles are expanded to permissions here only.
 * Deny-by-default: anything not listed is forbidden.
 */
export const PERMISSIONS = [
  "dashboard.view",
  "users.view",
  "users.manage", // suspend / ban / restrict / force logout
  "users.delete",
  "users.notes",
  "users.export",
  "wallet.adjust", // create manual credits / debits
  "wallet.adjust.approve", // approve high-value adjustments (dual control)
  "deposits.view",
  "deposits.review",
  "withdrawals.view",
  "withdrawals.review",
  "ledger.view",
  "ledger.export",
  "settings.view",
  "settings.manage",
  "security.view",
  "security.manage",
  "reports.view",
  "audit.view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL: Permission[] = [...PERMISSIONS];

export const ROLE_PERMISSIONS: Record<AdminRole, Permission[]> = {
  super_admin: ALL,

  finance_admin: [
    "dashboard.view",
    "users.view",
    "wallet.adjust",
    "wallet.adjust.approve",
    "deposits.view",
    "deposits.review",
    "withdrawals.view",
    "withdrawals.review",
    "ledger.view",
    "ledger.export",
    "reports.view",
    "settings.view",
    "audit.view",
  ],

  support_admin: [
    "dashboard.view",
    "users.view",
    "users.manage",
    "users.notes",
    "deposits.view",
    "withdrawals.view",
    "ledger.view",
    "audit.view",
  ],

  compliance_reviewer: [
    "dashboard.view",
    "users.view",
    "users.notes",
    "deposits.view",
    "withdrawals.view",
    "ledger.view",
    "ledger.export",
    "security.view",
    "security.manage",
    "reports.view",
    "audit.view",
  ],

  auditor: [
    "dashboard.view",
    "users.view",
    "deposits.view",
    "withdrawals.view",
    "ledger.view",
    "reports.view",
    "audit.view",
  ],
};

export const ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: "Super Admin",
  finance_admin: "Finance Admin",
  support_admin: "Support Admin",
  compliance_reviewer: "Compliance Reviewer",
  auditor: "Read-Only Auditor",
};

/**
 * Resolve the effective admin scope of an account.
 * The ADMIN_EMAIL account is always super_admin; everyone else uses the
 * `adminRole` a super admin granted them. `role` must be `admin` too.
 */
export function resolveAdminRole(
  user: { email: string; role: "user" | "admin"; adminRole: AdminRole | null },
  adminEmail: string | undefined,
): AdminRole | null {
  if (user.role !== "admin") return null;
  if (adminEmail && user.email.toLowerCase() === adminEmail.toLowerCase()) return "super_admin";
  return user.adminRole ?? null;
}

export function permissionsForRole(role: AdminRole | null | undefined): Permission[] {
  if (!role) return [];
  return ROLE_PERMISSIONS[role] ?? [];
}

export function roleHasPermission(role: AdminRole | null | undefined, permission: Permission): boolean {
  return permissionsForRole(role).includes(permission);
}
