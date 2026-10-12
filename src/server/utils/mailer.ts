import { getEnv } from "@/server/config/env";
import { BRAND_NAME } from "@/lib/brand";

export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
}

/**
 * Transactional email delivery.
 *
 * Production plug point: set RESEND_API_KEY (+ EMAIL_FROM) and messages are
 * delivered through Resend. Without a provider configured, emails are logged
 * server-side — the app never silently "pretends" to have sent mail, and
 * secrets/tokens are never leaked into API responses in production.
 */
export async function sendEmail(mail: OutboundEmail): Promise<{ delivered: boolean }> {
  const env = getEnv();

  if (env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
      }),
    });
    if (!res.ok) {
      console.error("[fast-wallet] email provider error:", res.status, await res.text().catch(() => ""));
      return { delivered: false };
    }
    return { delivered: true };
  }

  console.log(`[fast-wallet] email (no provider configured) — to=${mail.to} subject="${mail.subject}"`);
  return { delivered: false };
}

export function passwordResetEmail(to: string, resetUrl: string, ttlMinutes: number): OutboundEmail {
  return {
    to,
    subject: `${BRAND_NAME} — reset your password`,
    text: [
      `Hello,`,
      ``,
      `We received a request to reset the password for your ${BRAND_NAME} account.`,
      `Open this link within ${ttlMinutes} minutes to choose a new password:`,
      ``,
      resetUrl,
      ``,
      `If you did not request this, you can ignore this email — your password stays unchanged.`,
    ].join("\n"),
  };
}
