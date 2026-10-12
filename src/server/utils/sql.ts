import type { SQL } from "drizzle-orm";

/**
 * Drizzle maps `numeric` columns to `string`. Raw SQL fragments used in
 * `.set()` (e.g. `available::numeric + x`) are typed as SQL wrappers, so we
 * narrow them for strict TypeScript while keeping runtime semantics intact.
 */
export const numSql = (fragment: SQL): string => fragment as unknown as string;
