import { z } from "zod";

/* Client-side form schemas (mirror the server validators). Server-side
 * validation remains the source of truth — never trust the client. */

const passwordField = z
  .string({ required_error: "Password is required" })
  .min(8, "At least 8 characters")
  .max(72, "Password must be 72 characters or fewer")
  .regex(/[a-z]/, "Needs a lowercase letter")
  .regex(/[A-Z]/, "Needs an uppercase letter")
  .regex(/[0-9]/, "Needs a number");

const amountField = (min: string) =>
  z
    .string({ required_error: "Amount is required" })
    .trim()
    .regex(/^\d+(\.\d{1,8})?$/, "Enter a valid amount (up to 8 decimals)")
    .refine((v) => Number(v) > 0, "Amount must be greater than zero")
    .refine((v) => Number(v) >= Number(min), `Minimum is ${min} USDT`);

/** Same character rule as the server's nameField, so bad names are caught before the request. */
const nameField = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(60, `${label} is too long`)
    .regex(/^[\p{L}\p{M}\p{N}' -]+$/u, `${label} contains invalid characters`);

export const loginFormSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});
export type LoginFormValues = z.infer<typeof loginFormSchema>;

export const registerFormSchema = z
  .object({
    firstName: nameField("First name"),
    lastName: nameField("Last name"),
    email: z.string().trim().toLowerCase().email("Enter a valid email address").max(160, "Email is too long"),
    password: passwordField,
    confirmPassword: z.string(),
    acceptTerms: z.boolean().refine((v) => v === true, "Please accept the terms to continue"),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type RegisterFormValues = z.infer<typeof registerFormSchema>;

export const forgotFormSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
});
export type ForgotFormValues = z.infer<typeof forgotFormSchema>;

export const resetFormSchema = z
  .object({
    token: z.string().min(10, "Paste the reset token from your email link"),
    password: passwordField,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type ResetFormValues = z.infer<typeof resetFormSchema>;

export const depositFormSchema = z.object({
  network: z.literal("BEP20").default("BEP20"),
  amount: amountField("10"),
  txReference: z
    .string({ required_error: "Transaction hash is required" })
    .trim()
    .min(1, "Paste the transaction hash of your transfer")
    .regex(/^0x[a-fA-F0-9]{64}$/, "Enter a valid BSC transaction hash (0x + 64 hex characters)"),
});
export type DepositFormValues = z.infer<typeof depositFormSchema>;

export const withdrawalFormSchema = z
  .object({
    network: z.literal("BEP20").default("BEP20"),
    destinationAddress: z.string().trim().optional(),
    amount: amountField("5"),
  })
  .superRefine((d, ctx) => {
    if (d.destinationAddress && !/^0x[a-fA-F0-9]{40}$/.test(d.destinationAddress)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["destinationAddress"],
        message: "BEP20 addresses look like 0x + 40 hex characters",
      });
    }
  });
export type WithdrawalFormValues = z.infer<typeof withdrawalFormSchema>;

export const profileFormSchema = z.object({
  firstName: nameField("First name"),
  lastName: nameField("Last name"),
});
export type ProfileFormValues = z.infer<typeof profileFormSchema>;

export const passwordFormSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    password: passwordField,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type PasswordFormValues = z.infer<typeof passwordFormSchema>;
