import { withRoute, parseQuery, getClientIp } from "@/server/utils/api";
import { requirePermission } from "@/server/middleware/auth";
import { ledgerQuerySchema } from "@/server/validators";
import { exportLedgerCsv } from "@/server/services/admin-insights.service";
import { audit } from "@/server/utils/audit";

export const dynamic = "force-dynamic";

export const GET = withRoute(async (req: Request) => {
  const ctx = await requirePermission("ledger.export");
  const query = parseQuery(req, ledgerQuerySchema);
  const csv = await exportLedgerCsv(query);

  await audit({
    actorId: ctx.user.id,
    action: "ledger.exported",
    targetType: "transactions",
    metadata: { filters: query },
    ip: getClientIp(req),
  });

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="fastwallet-ledger.csv"',
      "Cache-Control": "no-store",
    },
  });
});
