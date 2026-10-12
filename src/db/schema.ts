import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  numeric,
  boolean,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ enums */

export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);

/** Granular administrative roles. `role=admin` gates entry; this grants scope. */
export const adminRoleEnum = pgEnum("admin_role", [
  "super_admin",
  "finance_admin",
  "support_admin",
  "compliance_reviewer",
  "auditor",
]);

export const userStatusEnum = pgEnum("user_status", [
  "active",
  "blocked",
  "suspended",
  "banned",
]);

export const adjustmentTypeEnum = pgEnum("adjustment_type", ["credit", "debit"]);

export const adjustmentStatusEnum = pgEnum("adjustment_status", [
  "pending_approval",
  "applied",
  "rejected",
]);

export const alertStatusEnum = pgEnum("alert_status", ["open", "investigating", "resolved"]);

export const alertSeverityEnum = pgEnum("alert_severity", ["low", "medium", "high", "critical"]);

export const networkEnum = pgEnum("network", ["BEP20", "TRC20"]);

export const requestStatusEnum = pgEnum("request_status", [
  "pending",
  "approved",
  "rejected",
  "cancelled",
]);

export const txTypeEnum = pgEnum("tx_type", [
  "deposit",
  "withdrawal",
  "adjustment",
  "seed",
  /** Manual administrative ledger adjustments — never provider receipts. */
  "admin_credit",
  "admin_debit",
]);

export const txStatusEnum = pgEnum("tx_status", [
  "pending",
  "completed",
  "rejected",
  "cancelled",
]);

/* ------------------------------------------------------------------ users */

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    firstName: text("first_name").notNull().default(""),
    lastName: text("last_name").notNull().default(""),
    role: userRoleEnum("role").notNull().default("user"),
    /** Scope of administrative powers; null for ordinary users. */
    adminRole: adminRoleEnum("admin_role"),
    /** Non-active accounts cannot sign in and have their sessions revoked. */
    status: userStatusEnum("status").notNull().default("active"),
    blockedAt: timestamp("blocked_at", { withTimezone: true }),
    blockedReason: text("blocked_reason"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    /** Account-level operational restrictions applied by administrators. */
    depositsDisabled: boolean("deposits_disabled").notNull().default(false),
    withdrawalsDisabled: boolean("withdrawals_disabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("users_email_idx").on(t.email), index("users_status_idx").on(t.status)],
);

/* --------------------------------------------------------------- sessions */

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    invalidatedAt: timestamp("invalidated_at", { withTimezone: true }),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/* ----------------------------------------------------- password reset flow */

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("prt_user_idx").on(t.userId)],
);

/* ----------------------------------------------------------------- wallets */

export const wallets = pgTable(
  "wallets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" })
      .unique(),
    asset: text("asset").notNull().default("USDT"),
    /** Decimal string, 8dp. Never use float arithmetic. */
    available: numeric("available", { precision: 28, scale: 8 }).notNull().default("0"),
    reserved: numeric("reserved", { precision: 28, scale: 8 }).notNull().default("0"),
    /** Legacy flag: true only for pre-production seeded rows. */
    isSimulated: boolean("is_simulated").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("wallets_user_idx").on(t.userId)],
);

/* --------------------------------------------------------- deposit requests */

export const depositRequests = pgTable(
  "deposit_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    asset: text("asset").notNull().default("USDT"),
    /** Null for card (Stripe) deposits; set for manual crypto deposits. */
    network: networkEnum("network"),
    amount: numeric("amount", { precision: 28, scale: 8 }).notNull(),
    depositAddress: text("deposit_address"),
    txReference: text("tx_reference"),
    /** How this deposit is settled: verified 'stripe' checkout or ops 'manual' review. */
    provider: text("provider").notNull().default("manual"),
    currency: text("currency").notNull().default("usd"),
    /** Provider object reference (e.g. Stripe Checkout Session id) — replay anchor. */
    providerRef: text("provider_ref"),
    checkoutUrl: text("checkout_url"),
    status: requestStatusEnum("status").notNull().default("pending"),
    idempotencyKey: text("idempotency_key").notNull(),
    reviewedBy: uuid("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("deposit_user_idem_unique").on(t.userId, t.idempotencyKey),
    uniqueIndex("deposit_provider_ref_unique").on(t.providerRef),
    /** A tx hash may only ever be claimed once across the whole database. */
    uniqueIndex("deposit_tx_reference_unique").on(t.txReference),
    index("deposit_user_idx").on(t.userId),
    index("deposit_status_idx").on(t.status),
  ],
);

/* ------------------------------------------------------------ payment events */

/** Append-only ledger of processed provider webhook events (replay shield). */
export const paymentEvents = pgTable(
  "payment_events",
  {
    /** Provider event id — primary key makes replays impossible. */
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    type: text("type").notNull(),
    livemode: boolean("livemode").notNull().default(false),
    payload: jsonb("payload"),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payment_events_provider_idx").on(t.provider)],
);

/* ------------------------------------------------------ withdrawal requests */

export const withdrawalRequests = pgTable(
  "withdrawal_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    asset: text("asset").notNull().default("USDT"),
    network: networkEnum("network").notNull(),
    amount: numeric("amount", { precision: 28, scale: 8 }).notNull(),
    fee: numeric("fee", { precision: 28, scale: 8 }).notNull().default("0"),
    /** Optional payout address (BEP20). */
    destinationAddress: text("destination_address"),
    /** Human-readable transfer code handed to the user, unique platform-wide. */
    transferCode: text("transfer_code"),
    status: requestStatusEnum("status").notNull().default("pending"),
    idempotencyKey: text("idempotency_key").notNull(),
    reviewedBy: uuid("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("withdrawal_user_idem_unique").on(t.userId, t.idempotencyKey),
    uniqueIndex("withdrawal_transfer_code_unique").on(t.transferCode),
    index("withdrawal_user_idx").on(t.userId),
    index("withdrawal_status_idx").on(t.status),
  ],
);

/* ------------------------------------------------------------- transactions */

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: txTypeEnum("type").notNull(),
    status: txStatusEnum("status").notNull().default("pending"),
    asset: text("asset").notNull().default("USDT"),
    network: networkEnum("network"),
    /** Signed decimal string: credits positive, debits negative. */
    amount: numeric("amount", { precision: 28, scale: 8 }).notNull(),
    fee: numeric("fee", { precision: 28, scale: 8 }).notNull().default("0"),
    balanceAfter: numeric("balance_after", { precision: 28, scale: 8 }),
    /** Idempotency anchor, unique per user — prevents double crediting. */
    reference: text("reference").notNull(),
    counterparty: text("counterparty"),
    note: text("note"),
    isSimulated: boolean("is_simulated").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("tx_user_reference_unique").on(t.userId, t.reference),
    index("tx_user_created_idx").on(t.userId, t.createdAt),
    index("tx_type_idx").on(t.type),
    index("tx_status_idx").on(t.status),
  ],
);

/* ---------------------------------------------------------------- audit log */

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata"),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_created_idx").on(t.createdAt)],
);

/* ----------------------------------------------------- wallet adjustments */

/**
 * Manual administrative credits/debits. An adjustment is an accounting
 * instruction — it is NOT evidence that money was received. `fundingSource`
 * records the classification so wallet liabilities stay reconcilable.
 */
export const walletAdjustments = pgTable(
  "wallet_adjustments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    type: adjustmentTypeEnum("type").notNull(),
    amount: numeric("amount", { precision: 28, scale: 8 }).notNull(),
    currency: text("currency").notNull().default("USDT"),
    reason: text("reason").notNull(),
    note: text("note"),
    /** promotional | support | refund | correction | settlement | other */
    fundingSource: text("funding_source").notNull().default("not_cash_backed"),
    status: adjustmentStatusEnum("status").notNull().default("applied"),
    requiresDualApproval: boolean("requires_dual_approval").notNull().default(false),
    balanceAfter: numeric("balance_after", { precision: 28, scale: 8 }),
    reference: text("reference").notNull().unique(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    rejectionReason: text("rejection_reason"),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("adj_user_idx").on(t.userId),
    index("adj_status_idx").on(t.status),
    index("adj_created_idx").on(t.createdAt),
  ],
);

/* ------------------------------------------------------ platform settings */

export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------------------------- user notes & risk flags */

export const userNotes = pgTable(
  "user_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    /** note | risk_flag */
    kind: text("kind").notNull().default("note"),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("user_notes_user_idx").on(t.userId)],
);

/* --------------------------------------------------------- security alerts */

export const securityAlerts = pgTable(
  "security_alerts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    type: text("type").notNull(),
    severity: alertSeverityEnum("severity").notNull().default("medium"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    summary: text("summary").notNull(),
    details: jsonb("details"),
    status: alertStatusEnum("status").notNull().default("open"),
    investigationNote: text("investigation_note"),
    resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("alerts_status_idx").on(t.status), index("alerts_created_idx").on(t.createdAt)],
);

/* ------------------------------------------------------- user notifications */

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    reference: text("reference"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notif_user_idx").on(t.userId, t.createdAt)],
);

/* ------------------------------------------------------------ login attempts */

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    success: boolean("success").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("login_attempts_email_idx").on(t.email, t.createdAt)],
);

/* ------------------------------------------------------------------- types */

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type Wallet = typeof wallets.$inferSelect;
export type DepositRequest = typeof depositRequests.$inferSelect;
export type WithdrawalRequest = typeof withdrawalRequests.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type PaymentEvent = typeof paymentEvents.$inferSelect;
export type WalletAdjustment = typeof walletAdjustments.$inferSelect;
export type PlatformSetting = typeof platformSettings.$inferSelect;
export type UserNote = typeof userNotes.$inferSelect;
export type SecurityAlert = typeof securityAlerts.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type LoginAttempt = typeof loginAttempts.$inferSelect;
export type AdminRole = (typeof adminRoleEnum.enumValues)[number];
