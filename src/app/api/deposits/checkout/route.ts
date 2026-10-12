import { withRoute, ok, parseBody, getClientIp } from "@/server/utils/api";
import { requireUser } from "@/server/middleware/auth";
import { depositCheckoutSchema } from "@/server/validators";
import { createDepositCheckout } from "@/server/services/checkout.service";
import { rateLimitOrThrow } from "@/server/middleware/rateLimit";

export const dynamic = "force-dynamic";

export const POST = withRoute(async (req: Request) => {
  const user = await requireUser();
  const input = await parseBody(req, depositCheckoutSchema);
  rateLimitOrThrow(req, "deposit-checkout", { limit: 20, windowMs: 10 * 60_000, scope: user.id });

  const result = await createDepositCheckout(user, input, getClientIp(req));
  return ok(
    { request: result.request, checkoutUrl: result.checkoutUrl, duplicate: result.duplicate },
    result.duplicate ? 200 : 201,
  );
});
