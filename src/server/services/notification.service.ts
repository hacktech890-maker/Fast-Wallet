import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";

type InsertExecutor = Pick<typeof db, "insert">;

export interface NotifyInput {
  userId: string;
  type: string;
  title: string;
  body: string;
  reference?: string;
}

/** Create a user-facing notification. Pass a tx handle to keep it atomic
 *  with the financial operation that triggered it. */
export async function notify(input: NotifyInput, tx?: InsertExecutor): Promise<void> {
  const exec = tx ?? db;
  try {
    await exec.insert(notifications).values({
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      reference: input.reference ?? null,
    });
  } catch (e) {
    // Never let a notification failure roll back money movement.
    if (tx) throw e;
    console.error("[fast-wallet] notification insert failed:", e);
  }
}

export async function listNotifications(userId: string, limit = 20) {
  const items = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);

  const [{ unread }] = await db
    .select({ unread: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));

  return { items, unread: Number(unread ?? 0) };
}

export async function markAllRead(userId: string): Promise<number> {
  const rows = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  return rows.length;
}
