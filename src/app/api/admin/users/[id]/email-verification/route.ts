import { z } from "zod";
import { withRoute, ok, parseBody, getClientIp } from "@/server/utils/api";
import { requirePermission } from "@/server/middleware/auth";
import { setEmailVerified } from "@/server/services/admin.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({ verified: z.boolean() });

export const POST = withRoute(async (req: Request, ctx: unknown) => {
  const admin = await requirePermission("users.manage");
  const { id } = await (ctx as Ctx).params;
  const input = await parseBody(req, schema);
  return ok({ user: await setEmailVerified(admin.user.id, id, input.verified, getClientIp(req)) });
});
