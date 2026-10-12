import { withRoute, ok } from "@/server/utils/api";
import { requireUser } from "@/server/middleware/auth";
import { getTransaction } from "@/server/services/transaction.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute(async (_req: Request, ctx: unknown) => {
  const user = await requireUser();
  const { id } = await (ctx as Ctx).params;
  return ok({ transaction: await getTransaction(user, id) });
});
