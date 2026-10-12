import { withRoute, ok, parseQuery } from "@/server/utils/api";
import { requirePermission } from "@/server/middleware/auth";
import { requestListQuerySchema } from "@/server/validators";
import { listAllDeposits } from "@/server/services/admin.service";

export const dynamic = "force-dynamic";

export const GET = withRoute(async (req: Request) => {
  await requirePermission("deposits.view");
  const query = parseQuery(req, requestListQuerySchema);
  return ok(await listAllDeposits(query));
});
