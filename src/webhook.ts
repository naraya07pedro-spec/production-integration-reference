import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_CLOCK_SKEW_SECONDS = 300;

// The timestamp is authenticated together with exact raw bytes, not trusted separately.
export function signPayload(rawBody: string | Buffer, secret: string, timestamp: string): string {
  return createHmac("sha256", secret).update(timestamp + ".").update(rawBody).digest("hex");
}

export function verifyWebhookSignature(
  rawBody: string | Buffer, signature: string | undefined, secret: string,
  timestamp: string | undefined, nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!secret || !signature || !/^[a-fA-F0-9]{64}$/.test(signature) ||
      !timestamp || !/^\d{10}$/.test(timestamp) ||
      !Number.isSafeInteger(nowSeconds)) return false;
  const signedAt = Number(timestamp);
  if (!Number.isSafeInteger(signedAt) ||
      Math.abs(nowSeconds - signedAt) > MAX_CLOCK_SKEW_SECONDS) return false;
  return timingSafeEqual(
    Buffer.from(signPayload(rawBody, secret, timestamp), "hex"),
    Buffer.from(signature, "hex"),
  );
}
