import { withRoute, ok, parseQuery } from "@/server/utils/api";
import { requirePermission } from "@/server/middleware/auth";
import { auditQuerySchema } from "@/server/validators";
import { listAuditLogs } from "@/server/services/admin.service";

export const dynamic = "force-dynamic";

export const GET = withRoute(async (req: Request) => {
  await requirePermission("audit.view");
  const query = parseQuery(req, auditQuerySchema);
  return ok(await listAuditLogs(query));
});
