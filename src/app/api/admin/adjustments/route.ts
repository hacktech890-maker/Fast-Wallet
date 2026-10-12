import { withRoute, ok, parseBody, parseQuery, getClientIp } from "@/server/utils/api";
import { requirePermission } from "@/server/middleware/auth";
import { adjustmentCreateSchema, requestListQuerySchema } from "@/server/validators";
import { createAdjustment, listAdjustments } from "@/server/services/adjustment.service";
import { rateLimitOrThrow } from "@/server/middleware/rateLimit";
import { z } from "zod";

export const dynamic = "force-dynamic";

const listQuerySchema = requestListQuerySchema
  .omit({ status: true })
  .extend({
    status: z.enum(["pending_approval", "applied", "rejected"]).optional(),
    userId: z.string().uuid().optional(),
  });

export const GET = withRoute(async (req: Request) => {
  await requirePermission("wallet.adjust");
  const query = parseQuery(req, listQuerySchema);
  return ok(await listAdjustments(query));
});

export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("wallet.adjust");
  const input = await parseBody(req, adjustmentCreateSchema);
  rateLimitOrThrow(req, "wallet-adjust", { limit: 60, windowMs: 10 * 60_000, scope: ctx.user.id });

  const result = await createAdjustment(ctx, input, getClientIp(req));
  return ok(result, result.duplicate ? 200 : 201);
});
