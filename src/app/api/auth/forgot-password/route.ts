import { withRoute, ok, parseBody, getClientIp } from "@/server/utils/api";
import { forgotPasswordSchema } from "@/server/validators";
import { startPasswordReset } from "@/server/services/auth.service";
import { rateLimitOrThrow } from "@/server/middleware/rateLimit";
import { sendEmail, passwordResetEmail } from "@/server/utils/mailer";
import { getEnv } from "@/server/config/env";

export const dynamic = "force-dynamic";

export const POST = withRoute(async (req: Request) => {
  const input = await parseBody(req, forgotPasswordSchema);
  rateLimitOrThrow(req, "forgot-password", { limit: 6, windowMs: 10 * 60_000, scope: input.email });

  const result = await startPasswordReset(input.email, getClientIp(req));

  if (result) {
    const env = getEnv();
    const resetUrl = `${env.NEXT_PUBLIC_APP_URL}/reset-password?token=${encodeURIComponent(result.token)}`;
    await sendEmail(passwordResetEmail(input.email, resetUrl, env.PASSWORD_RESET_TTL_MINUTES));
  }

  // Always-uniform response: account existence is never revealed, and reset
  // tokens never appear in API responses outside local development.
  const devMode = getEnv().NODE_ENV !== "production";
  return ok({
    delivered: true,
    message: "If an account exists for this email, a reset link has been sent.",
    ...(result && devMode
      ? {
          devResetToken: result.token,
          expiresInMinutes: getEnv().PASSWORD_RESET_TTL_MINUTES,
        }
      : {}),
  });
});
