import { withRoute, parseQuery } from "@/server/utils/api";
import { requireUser } from "@/server/middleware/auth";
import { transactionQuerySchema } from "@/server/validators";
import { exportTransactionsCsv } from "@/server/services/transaction.service";

export const dynamic = "force-dynamic";

export const GET = withRoute(async (req: Request) => {
  const user = await requireUser();
  const query = parseQuery(req, transactionQuerySchema);
  const csv = await exportTransactionsCsv(user, query);

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="fastwallet-transactions.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
