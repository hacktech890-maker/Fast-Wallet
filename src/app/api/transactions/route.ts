import { withRoute, ok, parseQuery } from "@/server/utils/api";
import { requireUser } from "@/server/middleware/auth";
import { transactionQuerySchema } from "@/server/validators";
import { listTransactions } from "@/server/services/transaction.service";

export const dynamic = "force-dynamic";

export const GET = withRoute(async (req: Request) => {
  const user = await requireUser();
  const query = parseQuery(req, transactionQuerySchema);
  return ok(await listTransactions(user, query));
});
