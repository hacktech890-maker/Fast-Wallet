import { and, asc, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { transactions, type Transaction, type User } from "@/db/schema";
import { ApiError } from "@/server/utils/api";
import { toCsv } from "@/server/utils/csv";
import type { TransactionQuery } from "@/server/validators";

function buildConditions(user: User, q: TransactionQuery) {
  const conds = [eq(transactions.userId, user.id)];
  if (q.type) conds.push(eq(transactions.type, q.type));
  if (q.status) conds.push(eq(transactions.status, q.status));
  if (q.network) conds.push(eq(transactions.network, q.network));
  if (q.from) conds.push(gte(transactions.createdAt, new Date(`${q.from}T00:00:00.000Z`)));
  if (q.to) conds.push(lte(transactions.createdAt, new Date(`${q.to}T23:59:59.999Z`)));
  if (q.q) {
    const like = `%${q.q}%`;
    const search = or(
      ilike(transactions.reference, like),
      ilike(transactions.note, like),
      ilike(transactions.counterparty, like),
      ilike(sql`${transactions.id}::text`, like),
    );
    if (search) conds.push(search);
  }
  return conds;
}

export async function listTransactions(user: User, q: TransactionQuery) {
  const where = and(...buildConditions(user, q));
  const orderColumn = q.sort === "amount" ? sql`${transactions.amount}::numeric` : transactions.createdAt;
  const orderBy = q.order === "asc" ? asc(orderColumn) : desc(orderColumn);

  const items = await db
    .select()
    .from(transactions)
    .where(where)
    .orderBy(orderBy)
    .limit(q.limit)
    .offset((q.page - 1) * q.limit);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(transactions)
    .where(where);

  return { items, total: Number(count ?? 0), page: q.page, limit: q.limit };
}

export async function getTransaction(user: User, id: string): Promise<Transaction> {
  const [tx] = await db.select().from(transactions).where(eq(transactions.id, id)).limit(1);
  if (!tx || tx.userId !== user.id) throw ApiError.notFound("Transaction not found");
  return tx;
}

const EXPORT_LIMIT = 1000;

/** Export permitted (own) records as CSV, honouring the active filters. */
export async function exportTransactionsCsv(user: User, q: TransactionQuery): Promise<string> {
  const where = and(...buildConditions(user, q));
  const orderBy = q.order === "asc" ? asc(transactions.createdAt) : desc(transactions.createdAt);
  const items = await db.select().from(transactions).where(where).orderBy(orderBy).limit(EXPORT_LIMIT);

  return toCsv(
    ["id", "created_at", "type", "status", "asset", "network", "amount", "fee", "balance_after", "reference", "counterparty", "note", "simulated"],
    items.map((t) => [
      t.id,
      t.createdAt,
      t.type,
      t.status,
      t.asset,
      t.network,
      t.amount,
      t.fee,
      t.balanceAfter,
      t.reference,
      t.counterparty,
      t.note,
      t.isSimulated ? "yes" : "no",
    ]),
  );
}
