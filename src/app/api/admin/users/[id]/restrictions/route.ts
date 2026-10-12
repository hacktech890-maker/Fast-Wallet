import { withRoute, ok, parseBody, getClientIp } from "@/server/utils/api";
import { requirePermission } from "@/server/middleware/auth";
import { userRestrictionsSchema } from "@/server/validators";
import { setUserRestrictions } from "@/server/services/admin.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withRoute(async (req: Request, ctx: unknown) => {
  const admin = await requirePermission("users.manage");
  const { id } = await (ctx as Ctx).params;
  const input = await parseBody(req, userRestrictionsSchema);
  return ok({ user: await setUserRestrictions(admin.user.id, id, input, getClientIp(req)) });
});
