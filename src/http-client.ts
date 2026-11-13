import { HttpError, TransientError, parseRetryAfter } from "./retry.js";
import type { DownstreamClient, NormalizedLead } from "./types.js";

export class FetchDownstreamClient implements DownstreamClient {
  constructor(private readonly endpoint: string, private readonly token: string,
    private readonly timeoutMs = 5000) {
    const url = new URL(endpoint);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
        url.search || url.hash || !Number.isFinite(timeoutMs) || timeoutMs <= 0)
      throw new Error("Invalid downstream configuration");
    if (url.protocol !== "https:" && !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
      throw new Error("HTTPS required outside localhost");
  }
  async sendLead(lead: NormalizedLead, idempotencyKey: string): Promise<{ externalId: string | null }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      let response: Response;
      try {
        response = await fetch(this.endpoint, {
          method: "POST", redirect: "error",
          headers: { "content-type": "application/json", authorization: "Bearer " + this.token,
            "idempotency-key": idempotencyKey },
          body: JSON.stringify({ external_key: lead.id, email: lead.email,
            region: lead.region, source: lead.source, message: lead.message }),
          signal: controller.signal,
        });
      } catch (error) {
        if (controller.signal.aborted || error instanceof TypeError) throw new TransientError();
        throw error;
      }
      if (!response.ok) {
        // Only the 429 and 503 status contracts define an actionable retry hint.
        // Convert the header into a bounded interval, never return raw headers
        // or provider body content to logs/exception messages.
        const retryAfterMs = response.status === 429 || response.status === 503
          ? parseRetryAfter(response.headers.get("retry-after")) : null;
        await response.body?.cancel();
        throw new HttpError(response.status, retryAfterMs);
      }
      if (response.status === 204) return { externalId: null };
      // Keep timeout active while reading the body; never silently turn a timeout into success.
      // A successful status is not permission to buffer unbounded provider data.
      // Limit actual streamed bytes, not just an optional Content-Length header.
      const maxBytes = 16 * 1024;
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Invalid downstream response");
      const chunks: Uint8Array[] = [];
      let size = 0;
      let body: unknown;
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > maxBytes) {
            await reader.cancel();
            throw new Error("Invalid downstream response");
          }
          chunks.push(part.value);
        }
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch (error) {
        if (controller.signal.aborted || error instanceof TypeError) throw new TransientError();
        throw new Error("Invalid downstream response");
      } finally {
        reader.releaseLock();
      }
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid downstream response");
      const id = (body as { id?: unknown }).id;
      // 204 is the only explicitly ID-less success in this reference contract.
      // Do not record malformed JSON success as SENT with an unknown provider ID.
      if (typeof id !== "string" || !id.trim()) throw new Error("Invalid downstream response");
      return { externalId: id };
    } finally { clearTimeout(timer); }
  }
}
