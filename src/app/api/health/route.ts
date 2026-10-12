import { db, dbAvailable } from "@/db";
import { checkSchema } from "@/db/schema-check";
import { sql } from "drizzle-orm";
import { getEnv } from "@/server/config/env";

export const dynamic = "force-dynamic";

/** Liveness/readiness. 503 with a reason code when the app cannot serve:
 *  - DATABASE_NOT_CONFIGURED  → env var missing
 *  - DATABASE_UNREACHABLE     → connection refused / network / auth
 *  - SCHEMA_DRIFT             → DB reachable but tables/columns missing
 *                               (fix: `npm run db:setup`)
 *  Never report "ok" while anything is missing. Table/column names are only
 *  included outside production. */
export async function GET() {
  const verbose = process.env.NODE_ENV !== "production";

  if (!dbAvailable()) {
    return Response.json({ ok: false, reason: "DATABASE_NOT_CONFIGURED" }, { status: 503 });
  }
  try {
    await db.execute(sql`select 1`);
  } catch {
    return Response.json({ ok: false, reason: "DATABASE_UNREACHABLE" }, { status: 503 });
  }

  let schemaStatus: "current" | "unverified" = "current";
  try {
    const schema = await checkSchema(db);
    if (!schema.ok) {
      return Response.json(
        {
          ok: false,
          reason: "SCHEMA_DRIFT",
          hint: verbose ? "Run `npm run db:setup` against DATABASE_URL." : undefined,
          ...(verbose ? { missingTables: schema.missingTables, missingColumns: schema.missingColumns } : {}),
        },
        { status: 503 },
      );
    }
  } catch {
    // The catalog could not be read — don't claim more than we know.
    schemaStatus = "unverified";
  }

  let adminConfig: string | undefined;
  if (verbose) {
    try {
      const env = getEnv();
      adminConfig = env.ADMIN_CONFIG_ISSUE
        ? `ignored: ${env.ADMIN_CONFIG_ISSUE}`
        : env.ADMIN_EMAIL && env.ADMIN_PASSWORD
          ? "configured"
          : env.ADMIN_EMAIL
            ? "email only (no ADMIN_PASSWORD)"
            : "not configured";
    } catch {
      adminConfig = "environment invalid";
    }
  }

  return Response.json({ ok: true, db: "up", schema: schemaStatus, ...(verbose ? { adminConfig } : {}) });
}
