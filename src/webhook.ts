import { createHmac, timingSafeEqual } from "node:crypto";
export function signPayload(rawBody: string | Buffer, secret: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}
export function verifyWebhookSignature(rawBody: string | Buffer,
  signature: string | undefined, secret: string): boolean {
  if (!secret || !signature || !/^[a-fA-F0-9]{64}$/.test(signature)) return false;
  return timingSafeEqual(Buffer.from(signPayload(rawBody, secret), "hex"), Buffer.from(signature, "hex"));
}
