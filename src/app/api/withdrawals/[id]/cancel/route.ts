import { withRoute, ok, getClientIp } from "@/server/utils/api";
import { requireUser } from "@/server/middleware/auth";
import { cancelWithdrawalRequest } from "@/server/services/withdrawal.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withRoute(async (req: Request, ctx: unknown) => {
  const user = await requireUser();
  const { id } = await (ctx as Ctx).params;
  const request = await cancelWithdrawalRequest(user, id, getClientIp(req));
  return ok({ request });
});
