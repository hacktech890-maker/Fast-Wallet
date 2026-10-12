import { withRoute, ok } from "@/server/utils/api";
import { requireUser } from "@/server/middleware/auth";
import { listNotifications, markAllRead } from "@/server/services/notification.service";

export const dynamic = "force-dynamic";

export const GET = withRoute(async () => {
  const user = await requireUser();
  return ok(await listNotifications(user.id));
});

export const POST = withRoute(async () => {
  const user = await requireUser();
  return ok({ marked: await markAllRead(user.id) });
});
