import { withRoute, ok, parseBody, getClientIp } from "@/server/utils/api";
import { registerSchema } from "@/server/validators";
import { registerUser } from "@/server/services/auth.service";
import { rateLimitOrThrow } from "@/server/middleware/rateLimit";
import { SESSION_COOKIE, getEnv, cookieSecure } from "@/server/config/env";

export const dynamic = "force-dynamic";

export const POST = withRoute(async (req: Request) => {
  const input = await parseBody(req, registerSchema);
  rateLimitOrThrow(req, "register", { limit: 20, windowMs: 10 * 60_000, scope: input.email });

  const { user, session } = await registerUser(input, getClientIp(req));

  const res = ok({ user }, 201);
  res.cookies.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: getEnv().COOKIE_SAME_SITE,
    expires: session.expiresAt,
    path: "/",
  });
  return res;
});
