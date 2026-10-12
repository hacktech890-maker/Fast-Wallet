import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { ZodError, type ZodType, type z } from "zod";
import { cookieSecure as cookieSecureFromEnv, EnvConfigError } from "@/server/config/env";

/* ---------------------------------------------------------------- ApiError */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  static unauthenticated(msg = "Authentication required") {
    return new ApiError(401, "UNAUTHENTICATED", msg);
  }
  static forbidden(msg = "You do not have permission to perform this action") {
    return new ApiError(403, "FORBIDDEN", msg);
  }
  static notFound(msg = "Resource not found") {
    return new ApiError(404, "NOT_FOUND", msg);
  }
  static conflict(code: string, msg: string) {
    return new ApiError(409, code, msg);
  }
  static badRequest(code: string, msg: string, details?: unknown) {
    return new ApiError(400, code, msg, details);
  }
}

/* ------------------------------------------------------------ responses */

export type ApiSuccess<T> = { ok: true; data: T };
export type ApiFailure = {
  ok: false;
  error: { code: string; message: string; details?: unknown };
};

export function ok<T>(data: T, status = 200): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ ok: true, data }, { status });
}

/* ---------------------------------------------------------- error handling */

const isProd = () => process.env.NODE_ENV === "production";

function handleApiError(error: unknown): NextResponse<ApiFailure> {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { ok: false, error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Please review the highlighted fields",
          details: error.flatten(),
        },
      },
      { status: 422 },
    );
  }
  // Broken server configuration (names the variables, never their values).
  if (error instanceof EnvConfigError) {
    console.error(`[fast-wallet] ${error.message}`);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "SERVER_MISCONFIGURED",
          message: "The server is not configured correctly. Please contact support.",
          ...(isProd() ? {} : { details: { problems: error.problems } }),
        },
      },
      { status: 500 },
    );
  }
  // Postgres driver errors: map common cases to clean HTTP responses.
  // Drizzle wraps driver errors, so inspect the error and its causes.
  const pgCode = extractPgCode(error);
  if (pgCode === "23505") {
    return NextResponse.json(
      { ok: false, error: { code: "DUPLICATE", message: "This request has already been recorded" } },
      { status: 409 },
    );
  }
  if (pgCode === "22P02") {
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: "Resource not found" } },
      { status: 404 },
    );
  }
  // The database is reachable but its tables/columns/enums are missing or
  // older than the code (migration never applied to THIS database). This is a
  // deployment problem, not a bug in the request: answer 503 and say how to fix it.
  if (isSchemaMissing(error)) {
    console.error(`[fast-wallet] DATABASE SCHEMA MISSING OR OUTDATED — run \`npm run db:setup\` against DATABASE_URL. Cause: ${summarizeError(error)}`);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "DATABASE_SCHEMA_MISSING",
          message: isProd()
            ? "The service is temporarily unavailable. Please try again shortly."
            : "The database tables are missing or out of date. Run `npm run db:setup` once, then retry.",
        },
      },
      { status: 503 },
    );
  }
  // Missing database configuration or unreachable database — the dependency
  // is unavailable (503), NOT an authentication failure or a generic 500.
  if (isDatabaseUnavailable(error)) {
    console.error(`[fast-wallet] database unavailable: ${summarizeError(error)}`);
    return NextResponse.json(
      { ok: false, error: { code: "DATABASE_UNAVAILABLE", message: "The service is temporarily unavailable. Please try again shortly." } },
      { status: 503 },
    );
  }
  logUnexpected(error);
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "INTERNAL",
        message: "Something went wrong. Please try again.",
        // Local development only: surface the real cause in the network tab.
        ...(isProd() ? {} : { details: { debug: summarizeError(error) } }),
      },
    },
    { status: 500 },
  );
}

/** Walk the error/cause chain (bounded). */
function errorChain(error: unknown, max = 4): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  let cur: unknown = error;
  for (let i = 0; i < max && typeof cur === "object" && cur !== null; i++) {
    out.push(cur as Record<string, unknown>);
    cur = (cur as { cause?: unknown }).cause;
  }
  return out;
}

/** Walk the error/cause chain looking for a Postgres error code. */
export function extractPgCode(error: unknown): string | undefined {
  for (const e of errorChain(error)) {
    if (typeof e.code === "string" && /^[0-9A-Z]{5}$/.test(e.code)) return e.code;
  }
  return undefined;
}

/** Postgres SQLSTATEs meaning "the schema is not what the code expects". */
const SCHEMA_PG_CODES = new Set([
  "42P01", // undefined_table   — relation "users" does not exist
  "42703", // undefined_column  — column "admin_role" does not exist
  "42704", // undefined_object  — type "user_status" does not exist
]);

function isSchemaMissing(error: unknown): boolean {
  const code = extractPgCode(error);
  return code !== undefined && SCHEMA_PG_CODES.has(code);
}

const NODE_NET_CODES = ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EHOSTUNREACH", "EAI_AGAIN", "EPIPE"];
/** Class 08 = connection exception; 28 = auth failure; 57P0x = server shutting down;
 *  53300 = too many connections; 3D000 = database does not exist. */
const CONNECTION_PG_RE = /^(08|28)/;
const CONNECTION_PG_CODES = new Set(["57P01", "57P02", "57P03", "53300", "3D000"]);
const CONNECTION_MESSAGE_RE =
  /timeout exceeded when trying to connect|connection terminated|connection (?:refused|closed)|self[- ]signed certificate|certificate|ssl/i;

/** Missing configuration or an unreachable / rejecting database server. */
function isDatabaseUnavailable(error: unknown): boolean {
  for (const e of errorChain(error)) {
    const code = typeof e.code === "string" ? e.code : "";
    if (code === "DATABASE_NOT_CONFIGURED") return true;
    if (NODE_NET_CODES.includes(code)) return true;
    if (CONNECTION_PG_RE.test(code) || CONNECTION_PG_CODES.has(code)) return true;
    if (typeof e.message === "string" && !e.message.startsWith("Failed query:") && CONNECTION_MESSAGE_RE.test(e.message)) return true;
  }
  return false;
}

/**
 * One-line description of an error for logs. Drizzle's top-level message embeds
 * the full SQL text AND the bound parameters (emails, password hashes, tokens),
 * so those are never logged — only the driver-level cause.
 */
export function summarizeError(error: unknown): string {
  return errorChain(error)
    .map((e) => {
      const name = typeof e.name === "string" ? e.name : "Error";
      const code = typeof e.code === "string" ? ` [${e.code}]` : "";
      const msg = typeof e.message === "string" && !e.message.startsWith("Failed query:") ? `: ${e.message}` : "";
      return `${name}${code}${msg}`;
    })
    .join(" → ");
}

function logUnexpected(error: unknown) {
  const isDb = errorChain(error).some((e) => typeof e.message === "string" && e.message.startsWith("Failed query:"));
  if (isDb) console.error(`[fast-wallet] unhandled database error: ${summarizeError(error)}`);
  else console.error("[fast-wallet] unhandled api error:", error);
}

type Handler = (req: Request, ctx: unknown) => Promise<Response> | Response;

/** Wrap a route handler with consistent, centralized error handling. */
export function withRoute(handler: Handler) {
  return async (req: Request, ctx: unknown): Promise<Response> => {
    try {
      return await handler(req, ctx);
    } catch (e) {
      return handleApiError(e);
    }
  };
}

/* -------------------------------------------------------------- validation */

export async function parseBody<S extends ZodType>(req: Request, schema: S): Promise<z.output<S>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON");
  }
  return schema.parse(json);
}

export function parseQuery<S extends ZodType>(req: Request, schema: S): z.output<S> {
  const url = new URL(req.url);
  const obj = Object.fromEntries(url.searchParams.entries());
  return schema.parse(obj);
}

/** Session cookies are host-only: no Domain attribute, path=/, Secure in
 *  production. httponly + samesite harden against CSRF/session fixation. */
export function sessionCookieAttributes() {
  return { path: "/", httpOnly: true, secure: cookieSecureFromEnv() } as const;
}

export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "127.0.0.1";
}
