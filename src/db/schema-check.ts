import { is, sql } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "./schema";

/**
 * Schema drift detection.
 *
 * The expected tables/columns are derived from the Drizzle schema itself, so
 * this can never fall out of sync with the code. Used by `npm run db:check`,
 * the migration runner's post-apply verification and `GET /api/health`.
 */

export interface ExpectedTable {
  name: string;
  columns: string[];
}

export function expectedTables(): ExpectedTable[] {
  return (Object.values(schema) as unknown[])
    .filter((v): v is PgTable => is(v, PgTable))
    .map((t) => {
      const cfg = getTableConfig(t);
      return { name: cfg.name, columns: cfg.columns.map((c) => c.name) };
    });
}

export interface SchemaReport {
  ok: boolean;
  missingTables: string[];
  /** table -> missing column names (only for tables that exist) */
  missingColumns: Record<string, string[]>;
}

interface Executor {
  execute: (q: ReturnType<typeof sql>) => Promise<{ rows: unknown[] }>;
}

export async function checkSchema(executor: Executor): Promise<SchemaReport> {
  const res = await executor.execute(sql`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
  `);

  const present = new Map<string, Set<string>>();
  for (const r of res.rows as { table_name: string; column_name: string }[]) {
    if (!present.has(r.table_name)) present.set(r.table_name, new Set());
    present.get(r.table_name)!.add(r.column_name);
  }

  const missingTables: string[] = [];
  const missingColumns: Record<string, string[]> = {};
  for (const t of expectedTables()) {
    const cols = present.get(t.name);
    if (!cols) {
      missingTables.push(t.name);
      continue;
    }
    const missing = t.columns.filter((c) => !cols.has(c));
    if (missing.length) missingColumns[t.name] = missing;
  }

  return {
    ok: missingTables.length === 0 && Object.keys(missingColumns).length === 0,
    missingTables,
    missingColumns,
  };
}
