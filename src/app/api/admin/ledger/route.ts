import { withRoute, ok, parseQuery } from "@/server/utils/api";
import { requirePermission } from "@/server/middleware/auth";
import { ledgerQuerySchema } from "@/server/validators";
import { exploreLedger } from "@/server/services/admin-insights.service";

export const dynamic = "force-dynamic";

/** Read-only ledger explorer. Entries are immutable — corrections are made
 *  with compensating adjustments, never by editing history. */
export const GET = withRoute(async (req: Request) => {
  await requirePermission("ledger.view");
  const query = parseQuery(req, ledgerQuerySchema);
  return ok(await exploreLedger(query));
});
