import bcrypt from "bcryptjs";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  users,
  wallets,
  loginAttempts,
  passwordResetTokens,
  type User,
  type AdminRole,
} from "@/db/schema";
import { permissionsForRole, resolveAdminRole, type Permission } from "@/server/config/permissions";
import { money } from "@/server/utils/money";
import { ApiError, extractPgCode } from "@/server/utils/api";
import { getEnv } from "@/server/config/env";
import { generateToken, hashToken } from "@/server/utils/crypto";
import { audit } from "@/server/utils/audit";
import { issueSession, invalidateAllSessions, type IssuedSession } from "@/server/middleware/auth";

export interface PublicUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "user" | "admin";
  adminRole: AdminRole | null;
  permissions: Permission[];
  status: User["status"];
  emailVerified: boolean;
  createdAt: Date;
}

/**
 * Effective administrative scope.
 *
 * The ADMIN_EMAIL account is always super_admin. Additional admins (created
 * by a super admin) carry their own `adminRole`. A database role alone is
 * never enough — `role` must be `admin` as well.
 */
export function effectiveAdminRole(u: Pick<User, "email" | "role" | "adminRole">): AdminRole | null {
  return resolveAdminRole(u, getEnv().ADMIN_EMAIL);
}

export function publicUser(u: User): PublicUser {
  const adminRole = effectiveAdminRole(u);
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    role: adminRole ? "admin" : "user",
    adminRole,
    permissions: permissionsForRole(adminRole),
    status: u.status,
    emailVerified: Boolean(u.emailVerifiedAt),
    createdAt: u.createdAt,
  };
}

async function findUserByEmail(email: string): Promise<User | null> {
  const [u] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  return u ?? null;
}

/** Constant-time string comparison (digests are compared, so lengths never leak). */
function constantTimeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

let dummyHash: string | null = null;
/** A real bcrypt hash used to equalise timing when the email is unknown. */
async function getDummyHash(): Promise<string> {
  dummyHash ??= await bcrypt.hash(randomBytes(16).toString("hex"), 10);
  return dummyHash;
}

/** True when this email is the environment-pinned administrator. */
export function isEnvAdminEmail(email: string): boolean {
  const adminEmail = getEnv().ADMIN_EMAIL;
  return Boolean(adminEmail) && email.toLowerCase() === adminEmail;
}

/** True when the administrator's password is owned by ADMIN_PASSWORD in the environment. */
export function isEnvManagedAdmin(email: string): boolean {
  return isEnvAdminEmail(email) && Boolean(getEnv().ADMIN_PASSWORD);
}

export async function registerUser(
  input: { firstName: string; lastName: string; email: string; password: string },
  ip: string,
): Promise<{ user: PublicUser; session: IssuedSession }> {
  const email = input.email.toLowerCase();

  // The administrator identity is owned by the environment (ADMIN_EMAIL /
  // ADMIN_PASSWORD). It can never be claimed through public sign-up — otherwise
  // anyone who knew the address could register it first and be promoted to
  // super_admin. Answer exactly like any other taken address.
  if (isEnvAdminEmail(email)) {
    throw ApiError.conflict("EMAIL_TAKEN", "An account with this email already exists");
  }

  const existing = await findUserByEmail(email);
  if (existing) throw ApiError.conflict("EMAIL_TAKEN", "An account with this email already exists");

  const passwordHash = await bcrypt.hash(input.password, 10);

  let user: User;
  try {
    user = await db.transaction(async (tx) => {
      const [u] = await tx
        .insert(users)
        .values({
          email,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          // Privilege escalation guard: the role is pinned server-side and can
          // never be influenced by client payloads.
          role: "user",
        })
        .returning();
      if (!u) throw new ApiError(500, "INTERNAL", "Failed to create account");

      // Every new wallet starts at exactly zero — funds arrive only through
      // verified payment confirmations or explicit administrative crediting.
      await tx
        .insert(wallets)
        .values({ userId: u.id, available: "0.00000000", reserved: "0.00000000", isSimulated: false });
      await audit(
        { actorId: u.id, action: "auth.register", targetType: "user", targetId: u.id, ip },
        tx,
      );
      return u;
    });
  } catch (e) {
    // Two simultaneous sign-ups with the same email: the unique index decides.
    if (extractPgCode(e) === "23505") {
      throw ApiError.conflict("EMAIL_TAKEN", "An account with this email already exists");
    }
    throw e;
  }

  const session = await issueSession(user.id, ip);
  return { user: publicUser(user), session };
}

/**
 * The ADMIN_EMAIL account is always the super administrator; it is promoted
 * automatically on sign-in. Other admin accounts keep whatever scope a super
 * admin granted them — self-promotion is impossible because `role`/`adminRole`
 * are never writable from any user-facing endpoint.
 */
async function reconcileAdminRole(user: User): Promise<User> {
  const adminEmail = getEnv().ADMIN_EMAIL;
  if (!adminEmail) return user;
  if (user.email.toLowerCase() !== adminEmail) return user;
  if (user.role === "admin" && user.adminRole === "super_admin") return user;

  const [promoted] = await db
    .update(users)
    .set({ role: "admin", adminRole: "super_admin", updatedAt: new Date() })
    .where(eq(users.id, user.id))
    .returning();
  await audit({
    actorId: user.id,
    action: "admin.role.granted",
    targetType: "user",
    targetId: user.id,
    metadata: { source: "ADMIN_EMAIL", adminRole: "super_admin" },
  });
  return promoted ?? user;
}

/**
 * Env-pinned admin bootstrap, invoked during every login attempt.
 *
 * If ADMIN_EMAIL + ADMIN_PASSWORD are set and the account does not exist yet,
 * it is created with super_admin privileges and an empty wallet. If it exists,
 * nothing is changed — password syncing happens separately and only when the
 * presented credential proves itself (see syncAdminCredentialsOnPassword).
 * Safe to call on every sign-in: fully idempotent.
 */
export async function ensureEnvAdminExists(): Promise<User | null> {
  const env = getEnv();
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) return null;

  const email = env.ADMIN_EMAIL.toLowerCase();
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) return existing;

  const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, 10);
  const [created] = await db
    .insert(users)
    .values({
      email,
      passwordHash,
      firstName: "Administrator",
      lastName: "",
      role: "admin",
      adminRole: "super_admin",
    })
    .onConflictDoNothing({ target: users.email })
    .returning();

  let admin = created ?? null;
  if (!admin) {
    // Lost a race against a concurrent provisioner — read the winner.
    const [again] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    admin = again ?? null;
  }

  if (admin && created) {
    await db
      .insert(wallets)
      .values({ userId: admin.id, available: money(0), reserved: money(0), isSimulated: false })
      .onConflictDoNothing();
    await audit({
      actorId: admin.id,
      action: "admin.provisioned",
      targetType: "user",
      targetId: admin.id,
      metadata: { by: "environment bootstrap" },
    });
  }
  return admin;
}

/**
 * The environment is the single source of truth for the administrator
 * credential. When the sign-in email is ADMIN_EMAIL and the presented password
 * equals ADMIN_PASSWORD (constant-time compare):
 *  - rotate the stored hash to the env password and revoke every existing
 *    session, so a rotation (e.g. after a leak) cuts off anyone holding the old one
 *  - clear blocked/suspended/banned states so the operator is never locked out
 *  - promote to super_admin
 * Returns the (possibly updated) user, or null if it wasn't the env credential.
 */
export async function syncAdminCredentialsOnPassword(email: string, presented: string): Promise<User | null> {
  const env = getEnv();
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) return null;
  if (email.toLowerCase() !== env.ADMIN_EMAIL) return null;
  if (!constantTimeEqual(presented, env.ADMIN_PASSWORD)) return null;

  const [user] = await db.select().from(users).where(eq(users.email, env.ADMIN_EMAIL)).limit(1);
  if (!user) return null;

  const hashMatches = await bcrypt.compare(env.ADMIN_PASSWORD, user.passwordHash);
  const needsSync =
    !hashMatches || user.role !== "admin" || user.adminRole !== "super_admin" || user.status !== "active";
  if (!needsSync) return user;

  const [row] = await db
    .update(users)
    .set({
      passwordHash: hashMatches ? user.passwordHash : await bcrypt.hash(env.ADMIN_PASSWORD, 10),
      role: "admin",
      adminRole: "super_admin",
      status: "active",
      blockedAt: null,
      blockedReason: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id))
    .returning();
  if (!hashMatches) await invalidateAllSessions(user.id);
  await audit({
    actorId: user.id,
    action: "admin.credentials.synced_from_env",
    targetType: "user",
    targetId: user.id,
    metadata: { envAdmin: true, passwordRotated: !hashMatches },
  });
  return row ?? user;
}

/** Record every sign-in attempt for brute-force and fraud monitoring. */
async function recordLoginAttempt(email: string, success: boolean, userId: string | null, ip: string, userAgent?: string) {
  try {
    await db.insert(loginAttempts).values({ email: email.toLowerCase(), userId, success, ip, userAgent: userAgent ?? null });
  } catch {
    /* monitoring must never block authentication */
  }
}

const STATUS_MESSAGES: Record<string, string> = {
  blocked: "This account has been suspended. Contact support if you believe this is an error.",
  suspended: "This account is temporarily suspended. Contact support for assistance.",
  banned: "This account has been permanently closed.",
};

export function accountStateError(status: User["status"]): ApiError | null {
  if (status === "active") return null;
  return new ApiError(403, "ACCOUNT_BLOCKED", STATUS_MESSAGES[status] ?? STATUS_MESSAGES.blocked!);
}

export async function loginUser(
  input: { email: string; password: string },
  ip: string,
  userAgent?: string,
): Promise<{ user: PublicUser; session: IssuedSession }> {
  const email = input.email.toLowerCase();
  const envManaged = isEnvManagedAdmin(email);

  // Environment-managed administrator: create the account on first use, then
  // authenticate ONLY against ADMIN_PASSWORD. The stored hash is deliberately
  // not an accepted credential here, so rotating ADMIN_PASSWORD immediately
  // invalidates the previous password.
  const found = envManaged ? await ensureEnvAdminExists() : await findUserByEmail(email);

  let authenticated: User | null = null;
  if (envManaged) {
    authenticated = await syncAdminCredentialsOnPassword(email, input.password);
  } else {
    // Always burn one bcrypt comparison so response time doesn't reveal
    // whether the email is registered.
    const passwordOk = await bcrypt.compare(input.password, found?.passwordHash ?? (await getDummyHash()));
    authenticated = found && passwordOk ? found : null;
  }

  if (!authenticated) {
    await recordLoginAttempt(email, false, found?.id ?? null, ip, userAgent);
    if (found) {
      await audit({ actorId: found.id, action: "auth.login.failed", targetType: "user", targetId: found.id, ip });
    }
    throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  const stateError = accountStateError(authenticated.status);
  if (stateError) {
    await recordLoginAttempt(email, false, authenticated.id, ip, userAgent);
    await audit({ actorId: authenticated.id, action: "auth.login.blocked", targetType: "user", targetId: authenticated.id, metadata: { status: authenticated.status }, ip });
    throw stateError;
  }

  const user = await reconcileAdminRole(authenticated);
  const session = await issueSession(user.id, ip, userAgent);
  // Telemetry never blocks a successful sign-in (a stale pre-migration
  // database must degrade gracefully, not 500).
  try {
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  } catch (e) {
    console.error("[fast-wallet] lastLoginAt update failed (non-fatal):", e instanceof Error ? e.message : e);
  }
  await recordLoginAttempt(email, true, user.id, ip, userAgent);
  await audit({ actorId: user.id, action: "auth.login", targetType: "user", targetId: user.id, ip });
  return { user: publicUser(user), session };
}

/**
 * Start the forgot-password flow. Returns the raw token when the account
 * exists; the caller decides how to deliver it (never returned in API responses).
 * Never throws for unknown emails — avoids account enumeration.
 */
export async function startPasswordReset(email: string, ip: string): Promise<{ token: string; userId: string } | null> {
  const user = await findUserByEmail(email);
  if (!user) return null;
  // The administrator password lives in the environment; a reset token would be
  // useless (the env value always wins), so don't issue one. The caller still
  // gives the same generic response, so nothing is revealed.
  if (isEnvManagedAdmin(user.email)) return null;
  const token = generateToken();
  const expiresAt = new Date(Date.now() + getEnv().PASSWORD_RESET_TTL_MINUTES * 60_000);
  await db.insert(passwordResetTokens).values({ userId: user.id, tokenHash: hashToken(token), expiresAt });
  await audit({ actorId: user.id, action: "auth.password_reset.requested", targetType: "user", targetId: user.id, ip });
  return { token, userId: user.id };
}

export async function completePasswordReset(token: string, newPassword: string, ip: string): Promise<void> {
  const digest = hashToken(token);
  const [row] = await db
    .select()
    .from(passwordResetTokens)
    .where(and(eq(passwordResetTokens.tokenHash, digest), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, new Date())))
    .limit(1);
  if (!row) throw ApiError.badRequest("RESET_TOKEN_INVALID", "This reset link is invalid or has expired");

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, row.userId));
    await tx.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, row.id));
    await audit({ actorId: row.userId, action: "auth.password_reset.completed", targetType: "user", targetId: row.userId, ip }, tx);
  });
  // Session invalidation: every existing session must die with the old password.
  await invalidateAllSessions(row.userId);
}

export async function changePassword(user: User, currentPassword: string, newPassword: string, ip: string): Promise<void> {
  if (isEnvManagedAdmin(user.email)) {
    throw ApiError.badRequest(
      "ADMIN_PASSWORD_MANAGED_BY_ENV",
      "The administrator password is managed through the ADMIN_PASSWORD environment variable. Change it there.",
    );
  }
  const match = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!match) throw new ApiError(401, "INVALID_CREDENTIALS", "Current password is incorrect");
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, user.id));
  await audit({ actorId: user.id, action: "auth.password_change", targetType: "user", targetId: user.id, ip });
  // Invalidate all sessions; caller issues a fresh one for the current device.
  await invalidateAllSessions(user.id);
}
