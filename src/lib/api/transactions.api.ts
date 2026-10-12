import { api, unwrap } from "./client";
import type { Paginated, Transaction, TransactionFilters } from "@/lib/types";

function cleanParams(filters: TransactionFilters) {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null && v !== "") out[k] = v as string | number;
  }
  return out;
}

export const transactionsApi = {
  list: (filters: TransactionFilters) =>
    unwrap<Paginated<Transaction>>(api.get("/transactions", { params: cleanParams(filters) })),

  get: (id: string) => unwrap<{ transaction: Transaction }>(api.get(`/transactions/${id}`)),

  /** Browser-side CSV download of the permitted records. */
  async exportCsv(filters: TransactionFilters): Promise<void> {
    const res = await api.get("/transactions/export", {
      params: cleanParams(filters),
      responseType: "blob",
    });
    const blob = new Blob([res.data as BlobPart], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fastwallet-transactions.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};
