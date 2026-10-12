import { withRoute, ok, parseBody, parseQuery, getClientIp } from "@/server/utils/api";
import { requireUser } from "@/server/middleware/auth";
import { withdrawalCreateSchema, requestListQuerySchema } from "@/server/validators";
import { createWithdrawalRequest, listWithdrawalRequests } from "@/server/services/withdrawal.service";
import { rateLimitOrThrow } from "@/server/middleware/rateLimit";

export const dynamic = "force-dynamic";

export const GET = withRoute(async (req: Request) => {
  const user = await requireUser();
  const query = parseQuery(req, requestListQuerySchema);
  return ok(await listWithdrawalRequests(user, query));
});

export const POST = withRoute(async (req: Request) => {
  const user = await requireUser();
  const input = await parseBody(req, withdrawalCreateSchema);
  rateLimitOrThrow(req, "withdrawal-create", { limit: 20, windowMs: 10 * 60_000, scope: user.id });

  const { request, duplicate } = await createWithdrawalRequest(user, input, getClientIp(req));
  return ok({ request, duplicate }, duplicate ? 200 : 201);
});
