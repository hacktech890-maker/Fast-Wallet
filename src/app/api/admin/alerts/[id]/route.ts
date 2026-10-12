import { withRoute, ok, parseBody, getClientIp } from "@/server/utils/api";
import { requirePermission } from "@/server/middleware/auth";
import { alertResolveSchema } from "@/server/validators";
import { resolveAlert } from "@/server/services/admin-insights.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withRoute(async (req: Request, ctx: unknown) => {
  const admin = await requirePermission("security.manage");
  const { id } = await (ctx as Ctx).params;
  const input = await parseBody(req, alertResolveSchema);
  return ok({ alert: await resolveAlert(admin.user.id, id, input, getClientIp(req)) });
});
