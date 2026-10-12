import { db } from "@/db";
import { auditLogs } from "@/db/schema";

type InsertExecutor = Pick<typeof db, "insert">;

export interface AuditEntry {
  actorId: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}

/**
 * Append an immutable administrative audit record.
 *
 * Pass a transaction handle when the audited action must commit atomically
 * with its data (financial actions — a failed audit rolls the money movement
 * back, which is the desired behaviour).
 *
 * Outside a transaction (telemetry-style events like logins), a schema drift
 * or a transient outage must NEVER break the user-facing operation, so the
 * failure is logged and swallowed instead of crashing the request.
 */
export async function audit(entry: AuditEntry, tx?: InsertExecutor): Promise<void> {
  const exec = tx ?? db;
  try {
    await exec.insert(auditLogs).values({
      actorId: entry.actorId,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      metadata: entry.metadata ?? null,
      ip: entry.ip ?? null,
    });
  } catch (e) {
    if (tx) throw e; // inside a transaction: fail the whole unit of work
    console.error("[fast-wallet] audit insert failed (non-fatal):", e instanceof Error ? e.message : e);
  }
}
