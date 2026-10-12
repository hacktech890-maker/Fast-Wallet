import axios, { AxiosError, type AxiosResponse } from "axios";

/**
 * Centralized API client. Base URL is environment-configurable;
 * cookies are always sent so the HTTP-only session works everywhere.
 */
export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api",
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
  timeout: 20000,
});

export interface ApiErrorDetails {
  fieldErrors?: Record<string, string[]>;
  [key: string]: unknown;
}

export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: ApiErrorDetails,
  ) {
    super(message);
    this.name = "ApiClientError";
  }

  /** First validation message for a form field, if the server supplied one. */
  fieldError(field: string): string | undefined {
    return this.details?.fieldErrors?.[field]?.[0];
  }
}

api.interceptors.response.use(
  (res) => res,
  (error: AxiosError<{ ok: false; error: { code: string; message: string; details?: ApiErrorDetails } }>) => {
    if (error.response) {
      const payload = error.response.data?.error;
      return Promise.reject(
        new ApiClientError(
          payload?.code ?? "UNKNOWN",
          payload?.message ?? "The request failed. Please try again.",
          error.response.status,
          payload?.details,
        ),
      );
    }
    return Promise.reject(
      new ApiClientError("NETWORK", "Cannot reach the server. Check your connection and retry.", 0),
    );
  },
);

interface Envelope<T> {
  ok: true;
  data: T;
}

/** Unwrap the `{ ok, data }` response envelope. */
export async function unwrap<T>(promise: Promise<AxiosResponse<Envelope<T>>>): Promise<T> {
  const res = await promise;
  return res.data.data;
}

/** Stable client-side idempotency key for financial mutations. */
export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}
