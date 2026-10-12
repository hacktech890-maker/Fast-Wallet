import { withRoute, ok, getClientIp } from "@/server/utils/api";
import { readSessionCookie, invalidateSession } from "@/server/middleware/auth";
import { getSessionWithUser } from "@/server/middleware/auth";
import { audit } from "@/server/utils/audit";
import { SESSION_COOKIE, getEnv, cookieSecure } from "@/server/config/env";

export const dynamic = "force-dynamic";

export const POST = withRoute(async (req: Request) => {
  const token = await readSessionCookie();
  const ctx = await getSessionWithUser();
  if (token) await invalidateSession(token);
  if (ctx) {
    await audit({
      actorId: ctx.user.id,
      action: "auth.logout",
      targetType: "user",
      targetId: ctx.user.id,
      ip: getClientIp(req),
    });
  }

  const res = ok({ loggedOut: true });
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: getEnv().COOKIE_SAME_SITE,
    maxAge: 0,
    path: "/",
  });
  return res;
});
