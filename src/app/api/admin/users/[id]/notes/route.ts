import { withRoute, ok, parseBody, getClientIp } from "@/server/utils/api";
import { requirePermission } from "@/server/middleware/auth";
import { userNoteSchema } from "@/server/validators";
import { addUserNote } from "@/server/services/admin.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Internal note or risk flag. Never visible to the end user. */
export const POST = withRoute(async (req: Request, ctx: unknown) => {
  const admin = await requirePermission("users.notes");
  const { id } = await (ctx as Ctx).params;
  const input = await parseBody(req, userNoteSchema);
  return ok({ note: await addUserNote(admin.user.id, id, input, getClientIp(req)) });
});
