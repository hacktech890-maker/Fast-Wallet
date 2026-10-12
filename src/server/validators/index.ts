import { z } from "zod";
import Decimal from "decimal.js";
import {
  AMOUNT_RE,
  isValidBep20Address,
  isValidTrc20Address,
} from "@/server/utils/money";

/* ------------------------------------------------------------------- shared */

export const NETWORKS = ["BEP20", "TRC20"] as const;
export type NetworkValue = (typeof NETWORKS)[number];

/**
 * Shape-only amount validation (positive, max 8dp, sane ceiling).
 * Business minimums/maximums are NOT hardcoded here — they come from the
 * database-backed platform settings and are enforced in the services, so the
 * same effective configuration governs the API and the UI.
 */
/**
 * Zod still runs `.refine()` after a failed `.regex()` check, so every
 * numeric refinement must tolerate malformed input — otherwise decimal.js
 * throws and the request 500s instead of returning a clean 422.
 */
const toDecimal = (v: string): Decimal | null => {
  if (!AMOUNT_RE.test(v)) return null;
  try {
    return new Decimal(v);
  } catch {
    return null;
  }
};

const isPositiveAmount = (v: string) => {
  const d = toDecimal(v);
  return d === null || d.gt(0);
};

const isWithinCeiling = (v: string) => {
  const d = toDecimal(v);
  return d === null || d.lte(new Decimal("1000000"));
};

const amountField = (_min?: string) =>
  z
    .string({ required_error: "Amount is required" })
    .trim()
    .regex(AMOUNT_RE, "Enter a valid amount with up to 8 decimals")
    .refine(isPositiveAmount, "Amount must be greater than zero")
    .refine(isWithinCeiling, "Amount exceeds the maximum of 1,000,000");

export const idempotencyKeyField = z
  .string()
  .min(8, "Idempotency key is too short")
  .max(80, "Idempotency key is too long");

const passwordField = z
  .string({ required_error: "Password is required" })
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be 72 characters or fewer")
  .regex(/[a-z]/, "Password needs a lowercase letter")
  .regex(/[A-Z]/, "Password needs an uppercase letter")
  .regex(/[0-9]/, "Password needs a number");

const nameField = (label: string) =>
  z
    .string({ required_error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(60, `${label} is too long`)
    .regex(/^[\p{L}\p{M}\p{N}' -]+$/u, `${label} contains invalid characters`);

const emailField = z
  .string({ required_error: "Email is required" })
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(160);

/* -------------------------------------------------------------------- auth */

export const registerSchema = z
  .object({
    firstName: nameField("First name"),
    lastName: nameField("Last name"),
    email: emailField,
    password: passwordField,
    confirmPassword: z.string(),
    acceptTerms: z.literal(true, {
      errorMap: () => ({ message: "You must accept the terms to create an account" }),
    }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email: emailField,
  password: z.string({ required_error: "Password is required" }).min(1, "Password is required"),
});

export const forgotPasswordSchema = z.object({
  email: emailField,
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(10, "Reset token is missing or invalid"),
    password: passwordField,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    password: passwordField,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

/* ---------------------------------------------------------------- deposits */

/** BSC transaction hash: 0x + 64 hex characters. */
export const isValidTxHash = (v: string): boolean => /^0x[a-fA-F0-9]{64}$/.test(v);

export const depositCreateSchema = z.object({
  asset: z.literal("USDT").default("USDT"),
  /** Deposits are accepted exclusively on BNB Smart Chain (BEP20). */
  network: z.literal("BEP20").default("BEP20"),
  amount: amountField("10"),
  txReference: z
    .string({ required_error: "Transaction hash is required" })
    .trim()
    .min(1, "Paste the transaction hash of your transfer")
    .refine(isValidTxHash, "Enter a valid BSC transaction hash (0x + 64 hex characters)")
    .transform((v) => v.toLowerCase()),
  idempotencyKey: idempotencyKeyField,
});

/** Verified card deposit — settled exclusively by the provider webhook. */
export const depositCheckoutSchema = z.object({
  amount: amountField("10"),
  idempotencyKey: idempotencyKeyField,
});

/* ------------------------------------------------------------- withdrawals */

export const withdrawalCreateSchema = z
  .object({
    asset: z.literal("USDT").default("USDT"),
    /** Transfers settle on BNB Smart Chain (BEP20) only. */
    network: z.literal("BEP20").default("BEP20"),
    amount: amountField("5"),
    destinationAddress: z
      .string()
      .trim()
      .optional()
      .or(z.literal(""))
      .transform((v) => (v ? v : undefined)),
    idempotencyKey: idempotencyKeyField,
  })
  .superRefine((d, ctx) => {
    if (d.destinationAddress && !isValidBep20Address(d.destinationAddress)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["destinationAddress"],
        message: "Enter a valid BEP20 address (0x + 40 hex characters)",
      });
    }
  });

/* --------------------------------------------------------- admin: users */

export const blockUserSchema = z.object({
  blocked: z.boolean({ required_error: "Specify the desired state" }),
  reason: z
    .string()
    .trim()
    .max(300, "Reason is too long")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined)),
});

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal("")).transform((v) => (v ? v : undefined));

/* ------------------------------------------------- admin: user management */

export const userStatusSchema = z.object({
  status: z.enum(["active", "suspended", "banned"], { required_error: "Select a status" }),
  reason: optionalText(300),
});

export const userRestrictionsSchema = z.object({
  depositsDisabled: z.boolean().optional(),
  withdrawalsDisabled: z.boolean().optional(),
  reason: optionalText(300),
});

export const userNoteSchema = z.object({
  kind: z.enum(["note", "risk_flag"]).default("note"),
  body: z.string().trim().min(1, "Note cannot be empty").max(2000, "Note is too long"),
});

/* --------------------------------------------------- admin: adjustments */

export const ADJUSTMENT_REASON_VALUES = [
  "promotional_credit",
  "customer_support",
  "approved_refund",
  "correction",
  "settlement",
  "other",
] as const;

export const FUNDING_SOURCE_VALUES = [
  "not_cash_backed",
  "bank_transfer_received",
  "crypto_received",
  "provider_settlement",
  "marketing_budget",
] as const;

export const adjustmentCreateSchema = z.object({
  userId: z.string().uuid("Select a valid user"),
  type: z.enum(["credit", "debit"], { required_error: "Choose credit or debit" }),
  // Any positive amount the currency precision supports — $1.00, $0.50, …
  amount: z
    .string({ required_error: "Amount is required" })
    .trim()
    .regex(AMOUNT_RE, "Enter a valid amount with up to 8 decimals")
    .refine(isPositiveAmount, "Amount must be greater than zero"),
  currency: z.string().trim().min(2).max(8).default("USDT"),
  reason: z.enum(ADJUSTMENT_REASON_VALUES, { required_error: "Select a reason" }),
  note: optionalText(1000),
  fundingSource: z.enum(FUNDING_SOURCE_VALUES).default("not_cash_backed"),
  idempotencyKey: idempotencyKeyField,
});

export const adjustmentPreviewSchema = z.object({
  userId: z.string().uuid("Select a valid user"),
  type: z.enum(["credit", "debit"]),
  amount: z.string().trim().regex(AMOUNT_RE, "Enter a valid amount"),
});

export const adjustmentRejectSchema = z.object({
  reason: z.string().trim().min(3, "A rejection reason is required").max(300),
});

/* ------------------------------------------------------ admin: settings */

export const settingsUpdateSchema = z.object({
  reason: z.string().trim().min(3, "Describe why this change is being made").max(300),
  settings: z.record(z.union([z.string(), z.boolean(), z.number()])),
});

/* ------------------------------------------------------- admin: security */

export const alertResolveSchema = z.object({
  status: z.enum(["open", "investigating", "resolved"]),
  note: optionalText(1000),
});

/* -------------------------------------------------------- admin: ledger */

export const ledgerQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).optional(),
  userId: z.string().uuid().optional(),
  type: z.enum(["deposit", "withdrawal", "adjustment", "seed", "admin_credit", "admin_debit"]).optional(),
  status: z.enum(["pending", "completed", "rejected", "cancelled"]).optional(),
  minAmount: z.string().regex(AMOUNT_RE).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const reportQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const statsQuerySchema = z.object({
  range: z.enum(["day", "week", "month", "custom"]).default("week"),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/* ------------------------------------------------------------------ profile */

export const profileUpdateSchema = z.object({
  firstName: nameField("First name"),
  lastName: nameField("Last name"),
});

/* -------------------------------------------------------------------- admin */

export const reviewSchema = z.object({
  action: z.enum(["approve", "reject"], { required_error: "Action is required" }),
  note: z.string().trim().max(500, "Note is too long").optional().or(z.literal("")).transform((v) => (v ? v : undefined)),
});

/* ------------------------------------------------------------------ queries */

const pageField = z.coerce.number().int().min(1).default(1);
const limitField = z.coerce.number().int().min(1).max(50).default(10);

export const requestListQuerySchema = z.object({
  page: pageField,
  limit: limitField,
  status: z.enum(["pending", "approved", "rejected", "cancelled"]).optional(),
});

export const transactionQuerySchema = z.object({
  page: pageField,
  limit: limitField,
  q: z.string().trim().max(120).optional(),
  type: z.enum(["deposit", "withdrawal", "adjustment", "seed", "admin_credit", "admin_debit"]).optional(),
  status: z.enum(["pending", "completed", "rejected", "cancelled"]).optional(),
  network: z.enum(NETWORKS).optional(),
  sort: z.enum(["date", "amount"]).default("date"),
  order: z.enum(["asc", "desc"]).default("desc"),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const adminUsersQuerySchema = z.object({
  page: pageField,
  limit: limitField,
  q: z.string().trim().max(120).optional(),
});

export const auditQuerySchema = z.object({
  page: pageField,
  limit: limitField,
});

/* ------------------------------------------------------------ inferred types */

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type DepositCreateInput = z.infer<typeof depositCreateSchema>;
export type DepositCheckoutInput = z.infer<typeof depositCheckoutSchema>;
export type WithdrawalCreateInput = z.infer<typeof withdrawalCreateSchema>;
export type TransactionQuery = z.infer<typeof transactionQuerySchema>;
export type RequestListQuery = z.infer<typeof requestListQuerySchema>;
export type ReviewInput = z.infer<typeof reviewSchema>;
