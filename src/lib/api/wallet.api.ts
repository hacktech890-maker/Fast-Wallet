import { api, unwrap } from "./client";
import type { BalancesResponse, WalletSummary } from "@/lib/types";

export const walletApi = {
  summary: () => unwrap<WalletSummary>(api.get("/wallet/summary")),
  balances: () => unwrap<BalancesResponse>(api.get("/wallet/balances")),
};
