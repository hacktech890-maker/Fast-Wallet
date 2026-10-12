import { withRoute, ok, parseBody, getClientIp } from "@/server/utils/api";
import { requireUser, issueSession } from "@/server/middleware/auth";
import { changePassword } from "@/server/services/auth.service";
import { passwordChangeSchema } from "@/server/validators";
import { SESSION_COOKIE, getEnv, cookieSecure } from "@/server/config/env";

export const dynamic = "force-dynamic";

export const PATCH = withRoute(async (req: Request) => {
  const user = await requireUser();
  const input = await parseBody(req, passwordChangeSchema);

  // Invalidates every existing session after verifying the old password.
  await changePassword(user, input.currentPassword, input.password, getClientIp(req));

  // Re-issue a fresh session for the current device so the user stays signed in.
  const session = await issueSession(user.id, getClientIp(req), req.headers.get("user-agent") ?? undefined);

  const res = ok({ changed: true, message: "Password updated. Other sessions were signed out." });
  res.cookies.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: getEnv().COOKIE_SAME_SITE,
    expires: session.expiresAt,
    path: "/",
  });
  return res;
});
