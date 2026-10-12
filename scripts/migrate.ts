/**
 * Fast Wallet — database setup / migration runner.
 *
 *   npm run db:setup     apply every migration in drizzle/migrations, then verify
 *   npm run db:check     verify only (no changes) — exits 1 when the schema is incomplete
 *
 * Reads DATABASE_URL from the shell or `.env` (the shell wins).
 *
 * Every migration is idempotent and additive (CREATE ... IF NOT EXISTS,
 * ADD COLUMN IF NOT EXISTS, guarded constraints) so it is safe to run against an
 * empty database, a half-migrated one, or a live one — it never drops data.
 * Migrations run in file-name order: 0000_baseline.sql, 0001_admin_control_plane.sql, ...
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as dotenv from "dotenv";

dotenv.config({ quiet: true });

/** host/database only — never print credentials. */
function describeTarget(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.port ? `:${u.port}` : ""}${u.pathname}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

function pgMessage(e: unknown): string {
  const err = e as { message?: string; cause?: { message?: string; code?: string }; code?: string };
  const inner = err?.cause ?? err;
  return `${inner?.code ? `[${inner.code}] ` : ""}${inner?.message ?? String(e)}`;
}

async function main() {
  const checkOnly = process.argv.includes("--check");

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required — set it in .env (or export it) before running this.");
    process.exit(1);
  }
  console.log(`Target database: ${describeTarget(process.env.DATABASE_URL)}`);

  const { db, pool } = await import("@/db");
  const { checkSchema } = await import("@/db/schema-check");
  if (!pool) throw new Error("database pool unavailable");

  try {
    await db.execute((await import("drizzle-orm")).sql`select 1`);
  } catch (e) {
    console.error(`Cannot connect to the database: ${pgMessage(e)}`);
    console.error("Check DATABASE_URL (host, credentials, sslmode) and that the database is reachable.");
    await pool.end();
    process.exit(1);
  }

  if (!checkOnly) {
    const dir = join(process.cwd(), "drizzle", "migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    console.log(`Applying ${files.length} migration file(s) ...`);
    for (const file of files) {
      try {
        await pool.query(readFileSync(join(dir, file), "utf8"));
        console.log(`  ✓ ${file}`);
      } catch (e) {
        console.error(`  ✗ ${file} failed: ${pgMessage(e)}`);
        await pool.end();
        process.exit(1);
      }
    }
  }

  const report = await checkSchema(db);
  if (report.ok) {
    console.log(checkOnly ? "Schema is complete." : "Migration complete. Schema verified: all tables and columns present.");
    await pool.end();
    return;
  }

  console.error("Schema is INCOMPLETE:");
  if (report.missingTables.length) console.error(`  missing tables: ${report.missingTables.join(", ")}`);
  for (const [t, cols] of Object.entries(report.missingColumns)) console.error(`  ${t}: missing columns ${cols.join(", ")}`);
  if (checkOnly) console.error("Run `npm run db:setup` to create/repair it.");
  await pool.end();
  process.exit(1);
}

main().catch((e) => {
  console.error("Migration failed:", pgMessage(e));
  process.exit(1);
});
