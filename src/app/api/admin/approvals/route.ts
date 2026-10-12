import { withRoute, ok } from "@/server/utils/api";
import { requirePermission } from "@/server/middleware/auth";
import { listPendingApprovals } from "@/server/services/admin.service";

export const dynamic = "force-dynamic";

export const GET = withRoute(async () => {
  await requirePermission("dashboard.view");
  return ok(await listPendingApprovals());
});
