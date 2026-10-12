import { cookies } from "next/headers";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users, type User, type Session, type AdminRole } from "@/db/schema";
import { permissionsForRole, resolveAdminRole, type Permission } from "@/server/config/permissions";
import { SESSION_COOKIE, getEnv } from "@/server/config/env";
import { hashToken, generateToken } from "@/server/utils/crypto";
import { ApiError } from "@/server/utils/api";

export interface IssuedSession {
  token: string;
  expiresAt: Date;
}

/** Create a new server-side session; only the HMAC digest is persisted. */
export async function issueSession(userId: string, ip?: string, userAgent?: string): Promise<IssuedSession> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + getEnv().SESSION_TTL_HOURS * 3600_000);
  await db.insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
    ip: ip ?? null,
    userAgent: userAgent ?? null,
  });
  return { token, expiresAt };
}

export async function invalidateSession(token: string): Promise<void> {
  await db
    .update(sessions)
    .set({ invalidatedAt: new Date() })
    .where(and(eq(sessions.tokenHash, hashToken(token)), isNull(sessions.invalidatedAt)));
}

export async function invalidateAllSessions(userId: string, exceptToken?: string): Promise<void> {
  const conditions = [eq(sessions.userId, userId), isNull(sessions.invalidatedAt)];
  await db
    .update(sessions)
    .set({ invalidatedAt: new Date() })
    .where(and(...conditions));
  // When a token must survive (e.g. password change keeps current session),
  // re-issue semantics: simplest correct approach is full invalidation and let
  // the caller issue a fresh session afterwards. `exceptToken` therefore only
  // used to skip when undefined check avoided — kept for API clarity.
  void exceptToken;
}

export async function readSessionCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

export async function getSessionWithUser(): Promise<{ user: User; session: Session } | null> {
  const token = await readSessionCookie();
  if (!token) return null;
  const digest = hashToken(token);
  const [row] = await db
    .select({ user: users, session: sessions })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, digest),
        gt(sessions.expiresAt, new Date()),
        isNull(sessions.invalidatedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Resolve the authenticated user or throw 401. Identity always comes from
 *  the server session — never from client-supplied ids. */
export async function requireUser(): Promise<User> {
  const ctx = await getSessionWithUser();
  if (!ctx) throw ApiError.unauthenticated();
  // A suspended/blocked/banned account loses access immediately, mid-session.
  if (ctx.user.status !== "active") {
    throw new ApiError(
      403,
      "ACCOUNT_BLOCKED",
      ctx.user.status === "banned"
        ? "This account has been permanently closed."
        : "This account has been suspended. Contact support if you believe this is an error.",
    );
  }
  return ctx.user;
}

/** Effective administrative scope for an account (null = not an admin). */
export function adminRoleOf(user: Pick<User, "email" | "role" | "adminRole">): AdminRole | null {
  return resolveAdminRole(user, getEnv().ADMIN_EMAIL);
}

export function isPlatformAdmin(user: Pick<User, "email" | "role" | "adminRole">): boolean {
  return adminRoleOf(user) !== null;
}

/** Require any administrator (scope-agnostic) or throw 401/403. */
export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (!isPlatformAdmin(user)) throw ApiError.forbidden("Administrator access required");
  return user;
}

export interface AdminContext {
  user: User;
  role: AdminRole;
  permissions: Permission[];
  can: (permission: Permission) => boolean;
}

/**
 * Require a specific permission. Roles are re-read from the database-backed
 * session on every request — never from the client — and access is denied by
 * default when the permission is not explicitly granted.
 */
export async function requirePermission(permission: Permission): Promise<AdminContext> {
  const user = await requireUser();
  const role = adminRoleOf(user);
  if (!role) throw ApiError.forbidden("Administrator access required");

  const permissions = permissionsForRole(role);
  if (!permissions.includes(permission)) {
    throw ApiError.forbidden(`Your role (${role}) is not permitted to perform this action`);
  }
  return {
    user,
    role,
    permissions,
    can: (p: Permission) => permissions.includes(p),
  };
}
