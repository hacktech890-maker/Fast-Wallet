import { withRoute, ok, parseBody, getClientIp } from "@/server/utils/api";
import { requirePermission } from "@/server/middleware/auth";
import { reviewSchema } from "@/server/validators";
import { reviewDeposit } from "@/server/services/admin.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withRoute(async (req: Request, ctx: unknown) => {
  const admin = (await requirePermission("deposits.review")).user;
  const { id } = await (ctx as Ctx).params;
  const input = await parseBody(req, reviewSchema);
  const request = await reviewDeposit(admin.id, id, input, getClientIp(req));
  return ok({ request });
});
