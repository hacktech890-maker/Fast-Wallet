import { createHmac, randomBytes } from "node:crypto";
import { getEnv } from "@/server/config/env";

/** Cryptographically strong opaque token for sessions and reset links. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** HMAC-SHA256 of an opaque token — only the digest is ever stored. */
export function hashToken(token: string): string {
  return createHmac("sha256", getEnv().SESSION_SECRET).update(token).digest("hex");
}

/** Constant-time-ish compare of two stored digests. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
