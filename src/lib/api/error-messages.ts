import { ApiClientError } from "./client";

/**
 * Maps any thrown error to a truthful, user-safe auth message.
 *
 * Critically, server/dependency failures are NOT reworded as credential
 * problems — a 500 must never masquerade as "invalid password" (that both
 * confuses users and hides outages from the people debugging them).
 */
export function authErrorMessage(e: unknown): string {
  if (e instanceof ApiClientError) {
    switch (e.code) {
      case "INVALID_CREDENTIALS":
        return "Invalid email or password. Please try again.";
      case "RATE_LIMITED":
      case "ACCOUNT_BLOCKED":
        return e.message;
      case "DATABASE_UNAVAILABLE":
        return "Our service is temporarily unavailable — please wait a moment and try again. Your credentials were not rejected.";
      case "DATABASE_SCHEMA_MISSING":
      case "SERVER_MISCONFIGURED":
        // The server already words this for the right audience (actionable in
        // development, generic in production).
        return e.message;
      case "EMAIL_TAKEN":
        return "An account with this email already exists. Try signing in instead.";
      case "ADMIN_PASSWORD_MANAGED_BY_ENV":
        return e.message;
      case "INTERNAL":
        return "Something went wrong on our side. Please try again; if it persists, contact support.";
      case "NETWORK":
        return "Cannot reach the server. Check your connection and retry.";
      case "VALIDATION_ERROR":
        return e.message;
      default:
        return e.message;
    }
  }
  return "Cannot reach the server. Please retry.";
}
