import { api, unwrap } from "./client";
import type { Network, Paginated, RequestStatus, WithdrawalRequest } from "@/lib/types";

export interface WithdrawalListParams {
  page?: number;
  limit?: number;
  status?: RequestStatus;
}

export interface CreateWithdrawalPayload {
  network: "BEP20";
  amount: string;
  destinationAddress?: string;
  idempotencyKey: string;
}

export const withdrawalsApi = {
  list: (params: WithdrawalListParams) =>
    unwrap<Paginated<WithdrawalRequest>>(api.get("/withdrawals", { params })),

  get: (id: string) => unwrap<{ request: WithdrawalRequest }>(api.get(`/withdrawals/${id}`)),

  create: (input: CreateWithdrawalPayload) =>
    unwrap<{ request: WithdrawalRequest; duplicate: boolean }>(api.post("/withdrawals", input)),

  cancel: (id: string) =>
    unwrap<{ request: WithdrawalRequest }>(api.post(`/withdrawals/${id}/cancel`)),
};
