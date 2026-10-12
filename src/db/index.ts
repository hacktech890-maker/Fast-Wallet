import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * Database connection.
 *
 * Fail-closed: when DATABASE_URL is missing the import does NOT crash the
 * entire process. Instead a `DATABASE_NOT_CONFIGURED` server error is thrown
 * the moment any DB operation runs, letting the API return a clean 503
 * ("temporarily unavailable") instead of a fatal module error or an
 * unhandled rejection. A real, working database is never faked — with no
 * configuration the app simply refuses DB work honestly.
 */

const databaseUrl = process.env.DATABASE_URL;

const globalForDb = globalThis as typeof globalThis & {
  __fastWalletPgPool?: Pool;
};

/** Parse sslmode out of the connection string without the node warning. */
function buildSslConfig(url: string): false | { rejectUnauthorized: boolean } | undefined {
  if (process.env.DATABASE_SSL === "false" || /[?&]sslmode=disable/.test(url)) return false;
  if (process.env.DATABASE_SSL === "true") {
    return { rejectUnauthorized: process.env.DATABASE_REJECT_UNAUTHORIZED !== "false" };
  }
  const match = url.match(/[?&]sslmode=([a-z-]+)/);
  if (!match) return undefined; // provider default
  // 'require' in pg 8.x means encrypted-without-cert-check; pg 9 changes that —
  // supplying an explicit config now keeps behavior stable across upgrades.
  return { rejectUnauthorized: match[1] === "verify-full" };
}

let pool: Pool | null = null;

if (databaseUrl) {
  pool =
    globalForDb.__fastWalletPgPool ??
    new Pool({
      connectionString: databaseUrl,
      // Serverless (Vercel): short idle timeout so pools don't hold stale
      // connections across cold starts; fail fast instead of hanging.
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 8_000,
      // Provider SSL: honor sslmode semantics explicitly so future pg versions
      // (9.x libpq changes) can't silently weaken authentication. Any sslmode
      // other than `disable` enables SSL; verify-full keeps a strict CA check,
      // everything else uses the provider default (Neon ships valid certs).
      ssl: buildSslConfig(databaseUrl),
    });

  if (process.env.NODE_ENV !== "production") {
    globalForDb.__fastWalletPgPool = pool;
  }

  pool.on("error", (err) => {
    // A background client hit a network failure — log sanitized info and let
    // the next operation reconnect rather than crashing the process.
    console.error("[fast-wallet] idle postgres client error:", err.message);
  });
}

class DatabaseNotConfiguredError extends Error {
  readonly code = "DATABASE_NOT_CONFIGURED";
  constructor() {
    super("Database is not configured. Set DATABASE_URL in the application environment.");
    this.name = "DatabaseNotConfiguredError";
  }
}

export { pool };

/**
 * The Drizzle client. Accessing any property/method while unconfigured throws
 * the explicit configuration error instead of a generic module crash.
 */
function createDbClient() {
  if (pool) return drizzle(pool);
  const thrower = () => {
    throw new DatabaseNotConfiguredError();
  };
  return new Proxy({} as ReturnType<typeof drizzle>, {
    get(_target, prop) {
      if (prop === "then" || prop === Symbol.toPrimitive || typeof prop === "symbol") return undefined;
      if (prop === "__unconfigured") return true;
      return thrower;
    },
  });
}

export const db = createDbClient();

/** True when a database is configured (pool exists). */
export function dbAvailable(): boolean {
  return pool !== null;
}
