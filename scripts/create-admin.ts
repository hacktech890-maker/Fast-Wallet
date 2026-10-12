/**
 * Fast Wallet — privileged admin provisioning tool (CLI only, never exposed via API).
 *
 *   npx tsx scripts/create-admin.ts <email> <password>
 *
 * Creates a new administrator account or promotes an existing user.
 * Passwords must satisfy the platform strength policy (8+ chars, upper,
 * lower, digit). Run this against the production database to create the
 * first administrator; there is intentionally NO default admin account.
 */

async function main() {
  try {
    process.loadEnvFile(".env");
  } catch {
    /* .env optional when DATABASE_URL is exported */
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

  const [email, password] = process.argv.slice(2);
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error("Usage: npx tsx scripts/create-admin.ts <email> <password>");
    process.exit(1);
  }
  if (
    !password ||
    password.length < 8 ||
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/[0-9]/.test(password)
  ) {
    console.error("Password must be 8+ characters and include uppercase, lowercase, and a number.");
    process.exit(1);
  }

  const bcrypt = (await import("bcryptjs")).default;
  const { eq, ne, and } = await import("drizzle-orm");
  const { db, pool } = await import("@/db");
  const { users, wallets } = await import("@/db/schema");
  const { audit } = await import("@/server/utils/audit");
  const { money } = await import("@/server/utils/money");
  const { getEnv } = await import("@/server/config/env");

  const normalized = email.toLowerCase();
  const designated = getEnv().ADMIN_EMAIL;

  // Exactly one administrator: the ADMIN_EMAIL from the environment.
  if (designated && designated !== normalized) {
    console.error(
      `Refusing to create an admin for ${normalized}.\n` +
        `ADMIN_EMAIL is set to ${designated} — only that address can hold admin privileges.\n` +
        `Update ADMIN_EMAIL (e.g. in your Vercel environment) if you want a different administrator.`,
    );
    process.exit(1);
  }
  if (!designated) {
    console.warn(
      `! ADMIN_EMAIL is not set. Set ADMIN_EMAIL=${normalized} in your environment,\n` +
        `  otherwise admin endpoints will reject this account at runtime.`,
    );
  }
  const passwordHash = await bcrypt.hash(password, 10);

  const [existing] = await db.select().from(users).where(eq(users.email, normalized)).limit(1);
  if (existing) {
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ role: "admin", adminRole: "super_admin", passwordHash, updatedAt: new Date() })
        .where(eq(users.id, existing.id));
      await audit(
        { actorId: existing.id, action: "admin.provisioned", targetType: "user", targetId: existing.id, metadata: { by: "create-admin cli", promoted: true } },
        tx,
      );
    });
    console.log(`✓ Existing user ${normalized} promoted to admin (password rotated).`);
  } else {
    await db.transaction(async (tx) => {
      const [u] = await tx
        .insert(users)
        .values({ email: normalized, passwordHash, firstName: "Administrator", lastName: "", role: "admin", adminRole: "super_admin" })
        .returning();
      if (!u) throw new Error("failed to create admin");
      await tx.insert(wallets).values({ userId: u.id, available: money(0), reserved: money(0), isSimulated: false });
      await audit(
        { actorId: u.id, action: "admin.provisioned", targetType: "user", targetId: u.id, metadata: { by: "create-admin cli", promoted: false } },
        tx,
      );
    });
    console.log(`✓ Administrator account created for ${normalized}.`);
  }

  // Demote any other account that still carries the admin role.
  const demoted = await db
    .update(users)
    .set({ role: "user", adminRole: null, updatedAt: new Date() })
    .where(and(eq(users.role, "admin"), ne(users.email, normalized)))
    .returning({ email: users.email });
  if (demoted.length) {
    console.log(`✓ Demoted ${demoted.length} other admin account(s): ${demoted.map((d) => d.email).join(", ")}`);
  }

  await pool?.end();
}

main().catch((err) => {
  console.error("create-admin failed:", err);
  process.exit(1);
});
