import { withRoute, ok, parseBody } from "@/server/utils/api";
import { requireUser } from "@/server/middleware/auth";
import { publicUser } from "@/server/services/auth.service";
import { updateProfile } from "@/server/services/user.service";
import { profileUpdateSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export const GET = withRoute(async () => {
  const user = await requireUser();
  return ok({ user: publicUser(user) });
});

export const PATCH = withRoute(async (req: Request) => {
  const user = await requireUser();
  const input = await parseBody(req, profileUpdateSchema);
  return ok({ user: await updateProfile(user, input) });
});
