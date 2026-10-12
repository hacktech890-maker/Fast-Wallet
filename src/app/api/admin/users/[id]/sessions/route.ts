import { withRoute, ok, getClientIp } from "@/server/utils/api";
import { requirePermission } from "@/server/middleware/auth";
import { revokeUserSessions } from "@/server/services/admin.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Force logout: revokes every active session without touching credentials. */
export const DELETE = withRoute(async (req: Request, ctx: unknown) => {
  const admin = await requirePermission("users.manage");
  const { id } = await (ctx as Ctx).params;
  return ok(await revokeUserSessions(admin.user.id, id, getClientIp(req)));
});
