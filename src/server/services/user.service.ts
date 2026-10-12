import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, type User } from "@/db/schema";
import { ApiError } from "@/server/utils/api";
import { publicUser, type PublicUser } from "@/server/services/auth.service";

export async function updateProfile(user: User, input: { firstName: string; lastName: string }): Promise<PublicUser> {
  const [updated] = await db
    .update(users)
    .set({ firstName: input.firstName, lastName: input.lastName, updatedAt: new Date() })
    .where(eq(users.id, user.id))
    .returning();
  if (!updated) throw ApiError.notFound("User not found");
  return publicUser(updated);
}
