import { withRoute, ok, parseQuery } from "@/server/utils/api";
import { requirePermission } from "@/server/middleware/auth";
import { statsQuerySchema } from "@/server/validators";
import { getDashboardStats, resolveRange } from "@/server/services/admin-insights.service";

export const dynamic = "force-dynamic";

export const GET = withRoute(async (req: Request) => {
  await requirePermission("dashboard.view");
  const query = parseQuery(req, statsQuerySchema);
  return ok(await getDashboardStats(resolveRange(query)));
});
