import { withRoute, ok, parseBody } from "@/server/utils/api";
import { requirePermission } from "@/server/middleware/auth";
import { adjustmentPreviewSchema } from "@/server/validators";
import { previewAdjustment } from "@/server/services/adjustment.service";

export const dynamic = "force-dynamic";

/** Read-only confirmation data: current balance, resulting balance and
 *  whether a second approver will be required. Writes nothing. */
export const POST = withRoute(async (req: Request) => {
  await requirePermission("wallet.adjust");
  const input = await parseBody(req, adjustmentPreviewSchema);
  return ok(await previewAdjustment(input.userId, input.type, input.amount));
});
