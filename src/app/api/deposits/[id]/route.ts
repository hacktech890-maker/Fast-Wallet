import { withRoute, ok } from "@/server/utils/api";
import { requireUser } from "@/server/middleware/auth";
import { getDepositRequest } from "@/server/services/deposit.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute(async (_req: Request, ctx: unknown) => {
  const user = await requireUser();
  const { id } = await (ctx as Ctx).params;
  return ok({ request: await getDepositRequest(user, id, user.role === "admin") });
});
