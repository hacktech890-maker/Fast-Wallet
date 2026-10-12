import { api, unwrap } from "./client";
import type {
  AdminDepositRow,
  AdminIdentity,
  AdminUserDetail,
  AdminUserRow,
  AdminWithdrawalRow,
  AdjustmentPreview,
  DashboardStats,
  DepositRequest,
  LedgerResponse,
  Paginated,
  PlatformSettings,
  ReportsResponse,
  RequestStatus,
  AuditLogRow,
  SecurityAlertRow,
  UserNoteRow,
  WalletAdjustmentRow,
  WithdrawalRequest,
} from "@/lib/types";

export interface AdminListParams {
  page?: number;
  limit?: number;
  status?: RequestStatus;
}

export interface ReviewPayload {
  action: "approve" | "reject";
  note?: string;
}

export interface PendingApprovals {
  deposits: AdminDepositRow[];
  withdrawals: AdminWithdrawalRow[];
  counts: { deposits: number; withdrawals: number };
}

export const adminApi = {
  users: (params: { page?: number; limit?: number; q?: string }) =>
    unwrap<Paginated<AdminUserRow>>(api.get("/admin/users", { params })),

  approvals: () => unwrap<PendingApprovals>(api.get("/admin/approvals")),

  setBlocked: (id: string, payload: { blocked: boolean; reason?: string }) =>
    unwrap<{ user: { id: string; email: string; status: string; blockedReason: string | null } }>(
      api.post(`/admin/users/${id}/block`, payload),
    ),

  deleteUser: (id: string) =>
    unwrap<{ id: string; email: string; deleted: boolean }>(api.delete(`/admin/users/${id}`)),

  deposits: (params: AdminListParams) =>
    unwrap<Paginated<AdminDepositRow>>(api.get("/admin/deposits", { params })),

  reviewDeposit: (id: string, payload: ReviewPayload) =>
    unwrap<{ request: DepositRequest }>(api.post(`/admin/deposits/${id}/review`, payload)),

  withdrawals: (params: AdminListParams) =>
    unwrap<Paginated<AdminWithdrawalRow>>(api.get("/admin/withdrawals", { params })),

  reviewWithdrawal: (id: string, payload: ReviewPayload) =>
    unwrap<{ request: WithdrawalRequest }>(api.post(`/admin/withdrawals/${id}/review`, payload)),

  auditLogs: (params: { page?: number; limit?: number }) =>
    unwrap<Paginated<AuditLogRow>>(api.get("/admin/audit-logs", { params })),

  /* ------------------------------------------------------------ identity */
  me: () => unwrap<AdminIdentity>(api.get("/admin/me")),

  /* ----------------------------------------------------------- dashboard */
  stats: (params: { range?: string; from?: string; to?: string }) =>
    unwrap<DashboardStats>(api.get("/admin/stats", { params })),

  reports: (params: { from?: string; to?: string }) =>
    unwrap<ReportsResponse>(api.get("/admin/reports", { params })),

  /* --------------------------------------------------- wallet adjustments */
  adjustments: (params: { page?: number; limit?: number; status?: string; userId?: string }) =>
    unwrap<Paginated<WalletAdjustmentRow>>(api.get("/admin/adjustments", { params })),

  previewAdjustment: (payload: { userId: string; type: "credit" | "debit"; amount: string }) =>
    unwrap<AdjustmentPreview>(api.post("/admin/adjustments/preview", payload)),

  createAdjustment: (payload: {
    userId: string;
    type: "credit" | "debit";
    amount: string;
    currency: string;
    reason: string;
    note?: string;
    fundingSource: string;
    idempotencyKey: string;
  }) =>
    unwrap<{ adjustment: WalletAdjustmentRow; duplicate: boolean; balanceAfter: string | null; pendingApproval: boolean }>(
      api.post("/admin/adjustments", payload),
    ),

  approveAdjustment: (id: string) =>
    unwrap<{ adjustment: WalletAdjustmentRow }>(api.post(`/admin/adjustments/${id}/approve`)),

  rejectAdjustment: (id: string, reason: string) =>
    unwrap<{ adjustment: WalletAdjustmentRow }>(api.post(`/admin/adjustments/${id}/reject`, { reason })),

  /* ------------------------------------------------------ user management */
  userDetail: (id: string) => unwrap<AdminUserDetail>(api.get(`/admin/users/${id}`)),

  setStatus: (id: string, payload: { status: "active" | "suspended" | "banned"; reason?: string }) =>
    unwrap<{ user: { id: string; email: string; status: string } }>(api.post(`/admin/users/${id}/status`, payload)),

  setRestrictions: (id: string, payload: { depositsDisabled?: boolean; withdrawalsDisabled?: boolean; reason?: string }) =>
    unwrap<{ user: { id: string; depositsDisabled: boolean; withdrawalsDisabled: boolean } }>(
      api.post(`/admin/users/${id}/restrictions`, payload),
    ),

  revokeSessions: (id: string) => unwrap<{ revoked: number }>(api.delete(`/admin/users/${id}/sessions`)),

  sendPasswordReset: (id: string) => unwrap<{ sent: boolean; email: string }>(api.post(`/admin/users/${id}/password-reset`)),

  setEmailVerified: (id: string, verified: boolean) =>
    unwrap<{ user: { id: string; emailVerified: boolean } }>(api.post(`/admin/users/${id}/email-verification`, { verified })),

  addNote: (id: string, payload: { kind: "note" | "risk_flag"; body: string }) =>
    unwrap<{ note: UserNoteRow }>(api.post(`/admin/users/${id}/notes`, payload)),

  /* ---------------------------------------------------------- ledger ---- */
  ledger: (params: Record<string, string | number | undefined>) =>
    unwrap<LedgerResponse>(api.get("/admin/ledger", { params })),

  /* --------------------------------------------------------- settings --- */
  settings: () => unwrap<{ settings: PlatformSettings }>(api.get("/admin/settings")),

  updateSettings: (settings: Partial<PlatformSettings>, reason: string) =>
    unwrap<{ changes: { key: string; previous: unknown; next: unknown }[]; settings: PlatformSettings }>(
      api.patch("/admin/settings", { settings, reason }),
    ),

  /* ---------------------------------------------------------- security -- */
  alerts: (params: { page?: number; limit?: number; status?: string }) =>
    unwrap<Paginated<SecurityAlertRow>>(api.get("/admin/alerts", { params })),

  scanAlerts: () => unwrap<{ created: number }>(api.post("/admin/alerts")),

  resolveAlert: (id: string, payload: { status: "open" | "investigating" | "resolved"; note?: string }) =>
    unwrap<{ alert: SecurityAlertRow }>(api.post(`/admin/alerts/${id}`, payload)),
};

/** Browser CSV download helper for permission-gated admin exports. */
export async function downloadAdminCsv(path: string, filename: string, params?: Record<string, unknown>) {
  const res = await api.get(path, { params, responseType: "blob" });
  const blob = new Blob([res.data as BlobPart], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
