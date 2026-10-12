import { withRoute, ok } from "@/server/utils/api";
import { getSessionWithUser } from "@/server/middleware/auth";
import { publicUser } from "@/server/services/auth.service";
import { ApiError } from "@/server/utils/api";

export const dynamic = "force-dynamic";

export const GET = withRoute(async () => {
  const ctx = await getSessionWithUser();
  if (!ctx) throw ApiError.unauthenticated();
  return ok({
    user: publicUser(ctx.user),
    session: { expiresAt: ctx.session.expiresAt, createdAt: ctx.session.createdAt },
  });
});
