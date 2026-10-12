import { api, unwrap } from "./client";
import type { DepositRequest, Network, Paginated, RequestStatus } from "@/lib/types";

export interface DepositListParams {
  page?: number;
  limit?: number;
  status?: RequestStatus;
}

export interface CreateDepositPayload {
  network: Network;
  amount: string;
  txReference?: string;
  idempotencyKey: string;
}

export const depositsApi = {
  list: (params: DepositListParams) =>
    unwrap<Paginated<DepositRequest>>(api.get("/deposits", { params })),

  get: (id: string) => unwrap<{ request: DepositRequest }>(api.get(`/deposits/${id}`)),

  create: (input: CreateDepositPayload) =>
    unwrap<{ request: DepositRequest; duplicate: boolean }>(api.post("/deposits", input)),

  /** Verified card top-up: creates (or resumes) a provider checkout session. */
  createCheckout: (input: { amount: string; idempotencyKey: string }) =>
    unwrap<{ request: DepositRequest; checkoutUrl: string; duplicate: boolean }>(
      api.post("/deposits/checkout", input),
    ),
};
