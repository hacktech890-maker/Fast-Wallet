import { withRoute, ok, parseBody, getClientIp } from "@/server/utils/api";
import { requirePermission } from "@/server/middleware/auth";
import { adjustmentRejectSchema } from "@/server/validators";
import { rejectAdjustment } from "@/server/services/adjustment.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withRoute(async (req: Request, ctx: unknown) => {
  const admin = await requirePermission("wallet.adjust.approve");
  const { id } = await (ctx as Ctx).params;
  const input = await parseBody(req, adjustmentRejectSchema);
  const adjustment = await rejectAdjustment(admin, id, input.reason, getClientIp(req));
  return ok({ adjustment });
});
