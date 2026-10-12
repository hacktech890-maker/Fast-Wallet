import { withRoute, ok, parseBody, getClientIp } from "@/server/utils/api";
import { requirePermission } from "@/server/middleware/auth";
import { settingsUpdateSchema } from "@/server/validators";
import { getSettings, updateSettings, settingsSchema } from "@/server/services/settings.service";

export const dynamic = "force-dynamic";

export const GET = withRoute(async () => {
  await requirePermission("settings.view");
  // Only operational policy is returned — secrets live in env, never here.
  return ok({ settings: await getSettings() });
});

export const PATCH = withRoute(async (req: Request) => {
  const ctx = await requirePermission("settings.manage");
  const input = await parseBody(req, settingsUpdateSchema);

  // Validate the patch against the canonical schema before persisting.
  const patch = settingsSchema.partial().parse(input.settings);
  const result = await updateSettings(ctx.user.id, patch, input.reason, getClientIp(req));
  return ok(result);
});
