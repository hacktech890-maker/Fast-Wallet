import { withRoute, ok, parseBody, getClientIp } from "@/server/utils/api";
import { resetPasswordSchema } from "@/server/validators";
import { completePasswordReset } from "@/server/services/auth.service";
import { rateLimitOrThrow } from "@/server/middleware/rateLimit";

export const dynamic = "force-dynamic";

export const POST = withRoute(async (req: Request) => {
  const input = await parseBody(req, resetPasswordSchema);
  rateLimitOrThrow(req, "reset-password", { limit: 10, windowMs: 10 * 60_000 });

  await completePasswordReset(input.token, input.password, getClientIp(req));
  return ok({ reset: true, message: "Password updated. All previous sessions were signed out." });
});
