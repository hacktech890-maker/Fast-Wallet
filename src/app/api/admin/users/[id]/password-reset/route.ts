import { withRoute, ok, getClientIp } from "@/server/utils/api";
import { requirePermission } from "@/server/middleware/auth";
import { triggerPasswordReset } from "@/server/services/admin.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Sends the user a reset link. The token is never returned to the admin. */
export const POST = withRoute(async (req: Request, ctx: unknown) => {
  const admin = await requirePermission("users.manage");
  const { id } = await (ctx as Ctx).params;
  return ok(await triggerPasswordReset(admin.user.id, id, getClientIp(req)));
});
