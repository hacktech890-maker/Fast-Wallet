import { withRoute, ok, parseBody, parseQuery, getClientIp } from "@/server/utils/api";
import { requireUser } from "@/server/middleware/auth";
import { depositCreateSchema, requestListQuerySchema } from "@/server/validators";
import { createDepositRequest, listDepositRequests } from "@/server/services/deposit.service";
import { rateLimitOrThrow } from "@/server/middleware/rateLimit";

export const dynamic = "force-dynamic";

export const GET = withRoute(async (req: Request) => {
  const user = await requireUser();
  const query = parseQuery(req, requestListQuerySchema);
  return ok(await listDepositRequests(user, query));
});

export const POST = withRoute(async (req: Request) => {
  const user = await requireUser();
  const input = await parseBody(req, depositCreateSchema);
  rateLimitOrThrow(req, "deposit-create", { limit: 30, windowMs: 10 * 60_000, scope: user.id });

  const { request, duplicate } = await createDepositRequest(user, input, getClientIp(req));
  return ok({ request, duplicate }, duplicate ? 200 : 201);
});
