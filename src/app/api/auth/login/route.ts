import { withRoute, ok, parseBody, getClientIp } from "@/server/utils/api";
import { loginSchema } from "@/server/validators";
import { loginUser } from "@/server/services/auth.service";
import { rateLimitOrThrow } from "@/server/middleware/rateLimit";
import { SESSION_COOKIE, getEnv, cookieSecure } from "@/server/config/env";

export const dynamic = "force-dynamic";

export const POST = withRoute(async (req: Request) => {
  const input = await parseBody(req, loginSchema);
  const env = getEnv();

  // Login rate limiting — per IP + account identifier.
  rateLimitOrThrow(req, "login", {
    limit: env.LOGIN_RATE_LIMIT_MAX,
    windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MINUTES * 60_000,
    scope: input.email,
  });

  const { user, session } = await loginUser(
    input,
    getClientIp(req),
    req.headers.get("user-agent") ?? undefined,
  );

  const res = ok({ user });
  res.cookies.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: getEnv().COOKIE_SAME_SITE,
    expires: session.expiresAt,
    path: "/",
  });
  return res;
});
