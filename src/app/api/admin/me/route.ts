import { withRoute, ok } from "@/server/utils/api";
import { requireAdmin, adminRoleOf } from "@/server/middleware/auth";
import { permissionsForRole, ROLE_LABELS } from "@/server/config/permissions";

export const dynamic = "force-dynamic";

/** The caller's effective administrative scope — used to shape the admin UI.
 *  Hiding buttons is cosmetic only; every endpoint re-checks permissions. */
export const GET = withRoute(async () => {
  const user = await requireAdmin();
  const role = adminRoleOf(user)!;
  return ok({
    id: user.id,
    email: user.email,
    role,
    roleLabel: ROLE_LABELS[role],
    permissions: permissionsForRole(role),
  });
});
