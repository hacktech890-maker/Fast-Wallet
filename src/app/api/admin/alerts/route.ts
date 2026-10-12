import { z } from "zod";
import { withRoute, ok, parseQuery } from "@/server/utils/api";
import { requirePermission } from "@/server/middleware/auth";
import { listAlerts, scanForAnomalies } from "@/server/services/admin-insights.service";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(["open", "investigating", "resolved"]).optional(),
});

export const GET = withRoute(async (req: Request) => {
  await requirePermission("security.view");
  const query = parseQuery(req, querySchema);
  return ok(await listAlerts(query));
});

/** Run anomaly detection on demand. Raises alerts only — never freezes
 *  funds or bans accounts automatically. */
export const POST = withRoute(async () => {
  await requirePermission("security.manage");
  return ok(await scanForAnomalies());
});
