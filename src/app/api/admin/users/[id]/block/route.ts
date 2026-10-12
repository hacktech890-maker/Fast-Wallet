import { withRoute, ok, parseBody, getClientIp } from "@/server/utils/api";
import { requirePermission } from "@/server/middleware/auth";
import { blockUserSchema } from "@/server/validators";
import { setUserBlocked } from "@/server/services/admin.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withRoute(async (req: Request, ctx: unknown) => {
  const admin = (await requirePermission("users.manage")).user;
  const { id } = await (ctx as Ctx).params;
  const input = await parseBody(req, blockUserSchema);
  const user = await setUserBlocked(admin.id, id, input, getClientIp(req));
  return ok({ user });
});
