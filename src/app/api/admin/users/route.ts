import { withRoute, ok, parseQuery } from "@/server/utils/api";
import { requirePermission } from "@/server/middleware/auth";
import { adminUsersQuerySchema } from "@/server/validators";
import { listUsers } from "@/server/services/admin.service";

export const dynamic = "force-dynamic";

export const GET = withRoute(async (req: Request) => {
  await requirePermission("users.view");
  const query = parseQuery(req, adminUsersQuerySchema);
  return ok(await listUsers(query));
});
