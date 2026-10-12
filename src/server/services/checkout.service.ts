import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { depositRequests, type User, type DepositRequest } from "@/db/schema";
import { ApiError } from "@/server/utils/api";
import { audit } from "@/server/utils/audit";
import { money } from "@/server/utils/money";
import { createStripeCheckoutSession } from "@/server/services/payment.service";
import { assertDepositAllowed } from "@/server/services/limits.service";
import type { DepositCheckoutInput } from "@/server/validators";

export interface CheckoutResult {
  request: DepositRequest;
  checkoutUrl: string;
  duplicate: boolean;
}

/**
 * Create (or return) a Stripe checkout session for a card deposit.
 * Idempotent per user + key: duplicate submissions reopen the SAME session —
 * no second request row, no second payment page, no possible double credit.
 *
 * The wallet is never touched here. Crediting happens exclusively inside the
 * signature-verified Stripe webhook (`payment.service.processStripeEvent`).
 */
export async function createDepositCheckout(
  user: User,
  input: DepositCheckoutInput,
  ip: string,
): Promise<CheckoutResult> {
  const [existing] = await db
    .select()
    .from(depositRequests)
    .where(and(eq(depositRequests.userId, user.id), eq(depositRequests.idempotencyKey, input.idempotencyKey)))
    .limit(1);
  if (existing) {
    if (existing.provider !== "stripe") {
      throw ApiError.conflict("IDEMPOTENCY_CONFLICT", "This idempotency key was used for a different deposit type");
    }
    if (existing.checkoutUrl && (existing.status === "pending" || existing.status === "approved")) {
      return { request: existing, checkoutUrl: existing.checkoutUrl, duplicate: true };
    }
    // A previous attempt failed before a session URL was issued (provider
    // outage / keys missing). Retry the checkout on the SAME row — never a
    // second request, never a second possible credit.
    try {
      const session = await createStripeCheckoutSession(user, existing.id, existing.amount);
      const [updated] = await db
        .update(depositRequests)
        .set({
          providerRef: session.sessionId,
          checkoutUrl: session.checkoutUrl,
          status: "pending",
          reviewNote: null,
          updatedAt: new Date(),
        })
        .where(eq(depositRequests.id, existing.id))
        .returning();
      await audit({
        actorId: user.id,
        action: "deposit.checkout.created",
        targetType: "deposit_request",
        targetId: existing.id,
        metadata: { amount: existing.amount, sessionId: session.sessionId, retry: true },
        ip,
      });
      return { request: updated ?? existing, checkoutUrl: session.checkoutUrl, duplicate: false };
    } catch (e) {
      if (e instanceof ApiError) throw e;
      console.error("[fast-wallet] stripe checkout session retry failed:", e);
      throw new ApiError(502, "PROVIDER_ERROR", "The payment provider could not start the checkout. Please try again.");
    }
  }

  const amount = money(input.amount);

  // Runtime-configurable limits + the provider's own minimum charge.
  await assertDepositAllowed(user, { amount, provider: "stripe" });

  // 1. Persist the intent first — the session references this immutable row.
  const [request] = await db
    .insert(depositRequests)
    .values({
      userId: user.id,
      asset: "USDT",
      network: null,
      amount,
      depositAddress: null,
      provider: "stripe",
      currency: "usd",
      idempotencyKey: input.idempotencyKey,
    })
    .returning();
  if (!request) throw new ApiError(500, "INTERNAL", "Failed to create deposit request");

  // 2. Ask the provider for a hosted checkout. On provider failure the
  //    request is closed as rejected so it cannot linger or be credited.
  try {
    const session = await createStripeCheckoutSession(user, request.id, amount);
    const [updated] = await db
      .update(depositRequests)
      .set({ providerRef: session.sessionId, checkoutUrl: session.checkoutUrl, updatedAt: new Date() })
      .where(eq(depositRequests.id, request.id))
      .returning();

    await audit({
      actorId: user.id,
      action: "deposit.checkout.created",
      targetType: "deposit_request",
      targetId: request.id,
      metadata: { amount, sessionId: session.sessionId },
      ip,
    });
    return { request: updated ?? request, checkoutUrl: session.checkoutUrl, duplicate: false };
  } catch (e) {
    await db
      .update(depositRequests)
      .set({ status: "rejected", reviewNote: "Payment provider error at checkout creation", updatedAt: new Date() })
      .where(eq(depositRequests.id, request.id));
    if (e instanceof ApiError) throw e;
    console.error("[fast-wallet] stripe checkout session failed:", e);
    throw new ApiError(502, "PROVIDER_ERROR", "The payment provider could not start the checkout. Please try again.");
  }
}
