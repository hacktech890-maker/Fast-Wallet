import { withRoute, parseQuery, getClientIp } from "@/server/utils/api";
import { requirePermission } from "@/server/middleware/auth";
import { adminUsersQuerySchema } from "@/server/validators";
import { exportUsersCsv } from "@/server/services/admin.service";
import { audit } from "@/server/utils/audit";

export const dynamic = "force-dynamic";

export const GET = withRoute(async (req: Request) => {
  const ctx = await requirePermission("users.export");
  const query = parseQuery(req, adminUsersQuerySchema);
  const csv = await exportUsersCsv(query);

  await audit({
    actorId: ctx.user.id,
    action: "users.exported",
    targetType: "users",
    metadata: { filters: query },
    ip: getClientIp(req),
  });

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="fastwallet-users.csv"',
      "Cache-Control": "no-store",
    },
  });
});
