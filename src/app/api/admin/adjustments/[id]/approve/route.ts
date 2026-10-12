import { withRoute, ok, getClientIp } from "@/server/utils/api";
import { requirePermission } from "@/server/middleware/auth";
import { approveAdjustment } from "@/server/services/adjustment.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withRoute(async (req: Request, ctx: unknown) => {
  const admin = await requirePermission("wallet.adjust.approve");
  const { id } = await (ctx as Ctx).params;
  const adjustment = await approveAdjustment(admin, id, getClientIp(req));
  return ok({ adjustment });
});
