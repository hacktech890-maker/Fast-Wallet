import { withRoute, ok, parseQuery } from "@/server/utils/api";
import { requirePermission } from "@/server/middleware/auth";
import { reportQuerySchema } from "@/server/validators";
import { buildReports, resolveRange } from "@/server/services/admin-insights.service";

export const dynamic = "force-dynamic";

export const GET = withRoute(async (req: Request) => {
  await requirePermission("reports.view");
  const query = parseQuery(req, reportQuerySchema);
  const range = resolveRange({ range: query.from ? "custom" : "month", from: query.from, to: query.to });
  return ok(await buildReports(range));
});
