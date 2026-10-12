/* Shared frontend types mirroring the REST API contract. */

export type Role = "user" | "admin";
export type Network = "BEP20" | "TRC20";
export type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";
export type TxType = "deposit" | "withdrawal" | "adjustment" | "seed" | "admin_credit" | "admin_debit";
export type TxStatus = "pending" | "completed" | "rejected" | "cancelled";

export type UserStatus = "active" | "blocked";

export interface PublicUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  status: UserStatus;
  createdAt: string;
}

export interface Transaction {
  id: string;
  userId: string;
  type: TxType;
  status: TxStatus;
  asset: string;
  network: Network | null;
  amount: string;
  fee: string;
  balanceAfter: string | null;
  reference: string;
  counterparty: string | null;
  note: string | null;
  isSimulated: boolean;
  createdAt: string;
}

export interface DepositRequest {
  id: string;
  userId: string;
  asset: string;
  network: Network | null;
  amount: string;
  depositAddress: string | null;
  txReference: string | null;
  provider: "manual" | "stripe" | string;
  currency: string;
  providerRef: string | null;
  checkoutUrl: string | null;
  status: RequestStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WithdrawalRequest {
  id: string;
  userId: string;
  asset: string;
  network: Network;
  amount: string;
  fee: string;
  destinationAddress: string | null;
  transferCode: string | null;
  status: RequestStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WalletSummary {
  simulated: boolean;
  label: string;
  asset: string;
  available: string;
  reserved: string;
  total: string;
  depositAddresses: { BEP20: string; TRC20: string };
  fee: { withdrawal: string };
  limits: { minDeposit: string; minWithdrawal: string };
  stats: {
    pendingDeposits: { count: number; sum: string };
    pendingWithdrawals: { count: number; sum: string };
    totalDeposited: string;
    totalWithdrawn: string;
  };
  recentTransactions: Transaction[];
}

export interface AssetBalance {
  asset: string;
  name: string;
  available: string;
  reserved: string;
  total: string;
  networks: { network: Network; chain: string; address: string }[];
}

export interface BalancesResponse {
  simulated: boolean;
  balances: AssetBalance[];
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface MeResponse {
  user: PublicUser;
  session: { expiresAt: string; createdAt: string };
}

export interface ForgotPasswordResponse {
  delivered: boolean;
  message: string;
  /** Only present in local development — never in production. */
  devResetToken?: string;
  expiresInMinutes?: number;
}

export interface AdminUserRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  status: UserStatus;
  blockedReason: string | null;
  createdAt: string;
  available: string;
  reserved: string;
  simulated: boolean;
}

export interface AdminDepositRow extends DepositRequest {
  userEmail: string;
}

export interface AdminWithdrawalRow extends WithdrawalRequest {
  userEmail: string;
}

export interface AuditLogRow {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

/* ------------------------------------------------------------- admin types */

export type AdminRole = "super_admin" | "finance_admin" | "support_admin" | "compliance_reviewer" | "auditor";

export interface AdminIdentity {
  id: string;
  email: string;
  role: AdminRole;
  roleLabel: string;
  permissions: string[];
}

export interface DashboardStats {
  range: { from: string; to: string };
  users: { total: number; active: number; suspended: number; banned: number; admins: number; newInRange: number };
  liabilities: { total: string; available: string; reserved: string; fundedWallets: number; notCashBacked: string };
  deposits: { pending: number; pendingSum: string; approvedSum: string; rejected: number; cardConfirmed: string; cryptoVerified: string };
  withdrawals: { pending: number; pendingSum: string; approvedSum: string; feesCollected: string; rejected: number };
  adjustments: { credits: string; debits: string; pendingApproval: number };
  payments: { events: number; completed: number; expired: number };
  security: { openAlerts: number; criticalAlerts: number; failedLogins: number };
  series: { date: string; inflow: number; outflow: number; count: number }[];
  recentTransactions: (Transaction & { userEmail: string })[];
  recentAdminActions: (AuditLogRow & { actorEmail: string | null })[];
}

export interface WalletAdjustmentRow {
  id: string;
  userId: string;
  userEmail?: string;
  createdBy: string | null;
  approvedBy: string | null;
  type: "credit" | "debit";
  amount: string;
  currency: string;
  reason: string;
  note: string | null;
  fundingSource: string;
  status: "pending_approval" | "applied" | "rejected";
  requiresDualApproval: boolean;
  balanceAfter: string | null;
  reference: string;
  rejectionReason: string | null;
  appliedAt: string | null;
  createdAt: string;
}

export interface AdjustmentPreview {
  user: { id: string; email: string; firstName: string; lastName: string; status: string };
  currentBalance: string;
  reserved: string;
  resultingBalance: string;
  wouldGoNegative: boolean;
  allowNegativeBalance: boolean;
  requiresDualApproval: boolean;
  highValueThreshold: string;
  recentTransactions: Transaction[];
}

export interface LedgerRow extends Transaction {
  userEmail: string;
}

export interface LedgerResponse {
  items: LedgerRow[];
  total: number;
  page: number;
  limit: number;
  totals: { credits: string; debits: string };
  anomalies: { duplicateReferences: { reference: string; count: number }[] };
}

export interface PlatformSettings {
  depositsEnabled: boolean;
  minDeposit: string;
  maxDeposit: string;
  depositMaintenanceMessage: string;
  withdrawalsEnabled: boolean;
  minWithdrawal: string;
  maxWithdrawal: string;
  withdrawalFee: string;
  withdrawalMaintenanceMessage: string;
  dailyDepositLimit: string;
  dailyWithdrawalLimit: string;
  networkBep20Enabled: boolean;
  cardDepositsEnabled: boolean;
  highValueAdjustmentThreshold: string;
  dualApprovalEnabled: boolean;
  allowNegativeBalance: boolean;
  failedLoginAlertThreshold: number;
  notifyOnAdjustment: boolean;
  notifyOnDeposit: boolean;
  notifyOnWithdrawal: boolean;
}

export interface SecurityAlertRow {
  id: string;
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  userId: string | null;
  userEmail: string | null;
  summary: string;
  details: Record<string, unknown> | null;
  status: "open" | "investigating" | "resolved";
  investigationNote: string | null;
  createdAt: string;
}

export interface UserNoteRow {
  id: string;
  userId: string;
  authorId: string | null;
  authorEmail: string | null;
  kind: string;
  body: string;
  createdAt: string;
}

export interface AdminUserDetail {
  user: AdminUserRow & {
    emailVerified: boolean;
    lastLoginAt: string | null;
    depositsDisabled: boolean;
    withdrawalsDisabled: boolean;
    adminRole: AdminRole | null;
  };
  deposits: DepositRequest[];
  withdrawals: WithdrawalRequest[];
  transactions: Transaction[];
  adjustments: WalletAdjustmentRow[];
  notes: UserNoteRow[];
  sessions: { id: string; ip: string | null; userAgent: string | null; createdAt: string; expiresAt: string }[];
  failedLoginCount: number;
}

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  reference: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface ReportsResponse {
  range: { from: string; to: string };
  depositsByProvider: { provider: string; status: string; count: number; total: string }[];
  withdrawalsByNetwork: { network: string | null; status: string; count: number; total: string; fees: string }[];
  adjustmentsByReason: { type: string; reason: string; fundingSource: string; count: number; total: string }[];
  daily: { day: string; count: number; credits: string; debits: string }[];
  liabilities: { available: string; reserved: string; total: string };
  reconciliation: {
    checked: number;
    clean: boolean;
    discrepancies: { userId: string; email: string; walletBalance: string; ledgerSum: string; difference: string }[];
  };
}

export interface TransactionFilters {
  page?: number;
  limit?: number;
  q?: string;
  type?: TxType;
  status?: TxStatus;
  network?: Network;
  sort?: "date" | "amount";
  order?: "asc" | "desc";
  from?: string;
  to?: string;
}
