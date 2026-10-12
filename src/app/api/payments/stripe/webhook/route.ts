import { ApiError, ok, withRoute, getClientIp } from "@/server/utils/api";
import { verifyWebhookSignature, processStripeEvent } from "@/server/services/payment.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Stripe webhook — the ONLY code path that credits card deposits.
 * The raw body is verified against the Stripe signature before anything is
 * read; unauthenticated/unverified payloads receive a 400 and zero effect.
 */
export const POST = withRoute(async (req: Request) => {
  const signature = req.headers.get("stripe-signature");
  if (!signature) throw ApiError.badRequest("MISSING_SIGNATURE", "Missing stripe-signature header");

  // Raw payload required for signature verification — never parse first.
  const payload = await req.text();
  const event = verifyWebhookSignature(payload, signature);

  const result = await processStripeEvent(event, getClientIp(req));
  // 200 semantics: always acknowledge valid, verified events (including
  // replays) so Stripe's retry policy stays quiet.
  return ok({ received: true, outcome: result.outcome });
});
