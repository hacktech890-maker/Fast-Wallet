import { withRoute, ok, getClientIp } from "@/server/utils/api";
import { requirePermission } from "@/server/middleware/auth";
import { deleteUserAccount } from "@/server/services/admin.service";
import { getUserDetail } from "@/server/services/admin-insights.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Full account profile. Password hashes and session secrets are never
 *  included — administrators cannot retrieve credentials. */
export const GET = withRoute(async (_req: Request, ctx: unknown) => {
  await requirePermission("users.view");
  const { id } = await (ctx as Ctx).params;
  return ok(await getUserDetail(id));
});

export const DELETE = withRoute(async (req: Request, ctx: unknown) => {
  const admin = await requirePermission("users.delete");
  const { id } = await (ctx as Ctx).params;
  return ok(await deleteUserAccount(admin.user.id, id, getClientIp(req)));
});
