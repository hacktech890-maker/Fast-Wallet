import { withRoute, ok } from "@/server/utils/api";
import { requireUser } from "@/server/middleware/auth";
import { getWalletSummary } from "@/server/services/wallet.service";

export const dynamic = "force-dynamic";

export const GET = withRoute(async () => {
  const user = await requireUser();
  return ok(await getWalletSummary(user));
});
