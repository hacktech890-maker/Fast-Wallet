import Stripe from "stripe";
import { and, eq, sql } from "drizzle-orm";
import Decimal from "decimal.js";
import { db } from "@/db";
import {
  depositRequests,
  paymentEvents,
  transactions,
  wallets,
  type User,
} from "@/db/schema";
import { ApiError } from "@/server/utils/api";
import { audit } from "@/server/utils/audit";
import { money } from "@/server/utils/money";
import { numSql } from "@/server/utils/sql";
import { getEnv } from "@/server/config/env";
import { BRAND_NAME } from "@/lib/brand";

/* ------------------------------------------------------------------ client */

let cachedClient: Stripe | null = null;

export function stripeConfigured(): boolean {
  return Boolean(getEnv().STRIPE_SECRET_KEY);
}

function getStripe(): Stripe {
  const key = getEnv().STRIPE_SECRET_KEY;
  if (!key) {
    throw new ApiError(
      503,
      "PROVIDER_NOT_CONFIGURED",
      "Card deposits will be enabled once the payment provider is configured.",
    );
  }
  cachedClient ??= new Stripe(key);
  return cachedClient;
}

/* -------------------------------------------------------- checkout session */

export interface CheckoutSessionResult {
  sessionId: string;
  checkoutUrl: string;
}

/**
 * Create a Stripe Checkout Session for an existing deposit request.
 * The wallet is NOT credited here — only the verified webhook may do that.
 */
export async function createStripeCheckoutSession(
  user: User,
  requestId: string,
  amount: string,
): Promise<CheckoutSessionResult> {
  const stripe = getStripe();
  const env = getEnv();
  const unitAmountCents = Number(new Decimal(amount).times(100).toFixed(0));

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    client_reference_id: requestId,
    customer_email: user.email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: env.STRIPE_CURRENCY,
          unit_amount: unitAmountCents,
          product_data: {
            name: `${BRAND_NAME} wallet top-up`,
            description: "Credits your wallet 1:1 after payment confirmation.",
          },
        },
      },
    ],
    metadata: { deposit_request_id: requestId },
    payment_intent_data: { metadata: { deposit_request_id: requestId } },
    success_url: `${env.NEXT_PUBLIC_APP_URL}/dashboard?deposit=success`,
    cancel_url: `${env.NEXT_PUBLIC_APP_URL}/dashboard?deposit=cancelled`,
  });

  if (!session.url) throw new ApiError(502, "PROVIDER_ERROR", "Payment provider did not return a checkout URL");
  return { sessionId: session.id, checkoutUrl: session.url };
}

/* ----------------------------------------------------- webhook verification */

/**
 * Verify the raw webhook payload against the Stripe signature.
 * Throws 400 on any mismatch — unverified payloads never reach the ledger.
 */
export function verifyWebhookSignature(payload: string, signatureHeader: string): Stripe.Event {
  const secret = getEnv().STRIPE_WEBHOOK_SECRET;
  const stripe = getStripe();
  if (!secret) {
    throw new ApiError(503, "PROVIDER_NOT_CONFIGURED", "Webhook verification secret is not configured");
  }
  try {
    return stripe.webhooks.constructEvent(payload, signatureHeader, secret);
  } catch {
    throw ApiError.badRequest("INVALID_SIGNATURE", "Webhook signature verification failed");
  }
}

/* ------------------------------------------------------- event processing */

interface SessionLike {
  id: string;
  amount_total: number | null;
  currency: string | null;
  payment_status: string;
  livemode: boolean;
  metadata?: Record<string, string> | null;
}

export interface ProcessResult {
  outcome: "credited" | "duplicate" | "unmatched" | "rejected" | "cancelled" | "awaiting_payment" | "ignored";
  detail?: string;
}

/**
 * Process a verified Stripe event. Replay-safe at three levels:
 *  1. payment_events row keyed by provider event id (insert first, in-tx)
 *  2. conditional status flip   UPDATE … WHERE status = 'pending'
 *  3. unique ledger reference   stripe:{session_id} (insert … on conflict → abort)
 */
export async function processStripeEvent(event: Stripe.Event, ip?: string): Promise<ProcessResult> {
  // Record the event first; a conflicting insert means exact replay.
  const recorded = await db
    .insert(paymentEvents)
    .values({
      id: event.id,
      provider: "stripe",
      type: event.type,
      livemode: event.livemode ?? false,
      payload: { type: event.type, created: event.created },
    })
    .onConflictDoNothing()
    .returning({ id: paymentEvents.id });
  if (recorded.length === 0) return { outcome: "duplicate", detail: event.id };

  switch (event.type) {
    case "checkout.session.completed":
      return creditCheckoutSession(event.data.object as Stripe.Checkout.Session as unknown as SessionLike, ip);
    case "checkout.session.expired":
      return cancelCheckoutSession(event.data.object as Stripe.Checkout.Session as unknown as SessionLike, ip);
    default:
      return { outcome: "ignored", detail: event.type };
  }
}

async function findRequestBySession(session: SessionLike) {
  const byRef = await db
    .select()
    .from(depositRequests)
    .where(and(eq(depositRequests.providerRef, session.id), eq(depositRequests.provider, "stripe")))
    .limit(1);
  if (byRef.length) return byRef[0]!;
  const metaId = session.metadata?.deposit_request_id;
  if (metaId) {
    const byMeta = await db.select().from(depositRequests).where(eq(depositRequests.id, metaId)).limit(1);
    if (byMeta.length) return byMeta[0]!;
  }
  return null;
}

async function creditCheckoutSession(session: SessionLike, ip?: string): Promise<ProcessResult> {
  const env = getEnv();
  const request = await findRequestBySession(session);
  if (!request) {
    await audit({
      actorId: null,
      action: "payment.unmatched_session",
      targetType: "stripe_session",
      targetId: session.id,
      metadata: { amount_total: session.amount_total, currency: session.currency },
      ip,
    });
    return { outcome: "unmatched", detail: session.id };
  }

  // Async payment methods: wait for the paid confirmation event.
  if (session.payment_status !== "paid") return { outcome: "awaiting_payment", detail: session.id };

  // Exactness + anti-manipulation: the charged amount must equal the
  // amount recorded when the request was created — down to the cent.
  if (session.currency?.toLowerCase() !== env.STRIPE_CURRENCY || session.amount_total === null) {
    return rejectRequest(request.id, "currency_or_amount_mismatch", request.userId, ip);
  }
  const expected = new Decimal(request.amount);
  const actual = new Decimal(session.amount_total).div(100);
  if (actual.toFixed(2) !== expected.toFixed(2)) {
    return rejectRequest(request.id, `amount_mismatch expected=${expected.toFixed(2)} actual=${actual.toFixed(2)}`, request.userId, ip);
  }

  return db.transaction(async (tx) => {
    // Conditional flip — only one credit path can ever succeed.
    const [flipped] = await tx
      .update(depositRequests)
      .set({ status: "approved", reviewNote: "Credited by verified payment webhook", updatedAt: new Date() })
      .where(and(eq(depositRequests.id, request.id), eq(depositRequests.status, "pending")))
      .returning();
    if (!flipped) return { outcome: "duplicate" as const, detail: request.id };

    const [wallet] = await tx
      .update(wallets)
      .set({ available: numSql(sql`(${wallets.available}::numeric + ${request.amount}::numeric)`), updatedAt: new Date() })
      .where(eq(wallets.userId, request.userId))
      .returning();
    if (!wallet) throw ApiError.notFound("Wallet not found for this user");

    const credited = await tx
      .insert(transactions)
      .values({
        userId: request.userId,
        type: "deposit",
        status: "completed",
        asset: "USDT",
        amount: money(request.amount),
        fee: money(0),
        balanceAfter: wallet.available,
        reference: `stripe:${session.id}`,
        counterparty: session.id,
        note: "Card deposit — credited after verified Stripe payment",
        isSimulated: false,
      })
      .onConflictDoNothing({ target: [transactions.userId, transactions.reference] })
      .returning({ id: transactions.id });
    if (credited.length === 0) {
      throw ApiError.conflict("ALREADY_CREDITED", "This payment was already credited");
    }

    await audit(
      {
        actorId: request.userId,
        action: "payment.deposit.credited",
        targetType: "deposit_request",
        targetId: request.id,
        metadata: { sessionId: session.id, amount: money(request.amount), livemode: session.livemode },
        ip,
      },
      tx,
    );
    return { outcome: "credited" as const, detail: money(request.amount) };
  });
}

async function cancelCheckoutSession(session: SessionLike, ip?: string): Promise<ProcessResult> {
  const request = await findRequestBySession(session);
  if (!request) return { outcome: "unmatched", detail: session.id };
  const [flipped] = await db
    .update(depositRequests)
    .set({ status: "cancelled", reviewNote: "Checkout session expired before payment", updatedAt: new Date() })
    .where(and(eq(depositRequests.id, request.id), eq(depositRequests.status, "pending")))
    .returning();
  if (flipped) {
    await audit({
      actorId: request.userId,
      action: "payment.deposit.expired",
      targetType: "deposit_request",
      targetId: request.id,
      metadata: { sessionId: session.id },
      ip,
    });
    return { outcome: "cancelled", detail: request.id };
  }
  return { outcome: "duplicate", detail: request.id };
}

async function rejectRequest(requestId: string, reason: string, userId: string, ip?: string): Promise<ProcessResult> {
  await db
    .update(depositRequests)
    .set({ status: "rejected", reviewNote: `Payment verification failed: ${reason}`, updatedAt: new Date() })
    .where(and(eq(depositRequests.id, requestId), eq(depositRequests.status, "pending")));
  await audit({
    actorId: userId,
    action: "payment.deposit.rejected",
    targetType: "deposit_request",
    targetId: requestId,
    metadata: { reason },
    ip,
  });
  return { outcome: "rejected", detail: reason };
}
