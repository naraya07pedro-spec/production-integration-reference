import { HttpError, TransientError } from "./retry.js";
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
        await response.body?.cancel();
        throw new HttpError(response.status);
      }
      if (response.status === 204) return { externalId: null };
      // Keep timeout active while reading the body; never silently turn a timeout into success.
      let body: unknown;
      try { body = await response.json(); }
      catch (error) {
        if (controller.signal.aborted || error instanceof TypeError) throw new TransientError();
        throw new Error("Invalid downstream JSON");
      }
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid downstream response");
      const id = (body as { id?: unknown }).id;
      return { externalId: typeof id === "string" ? id : null };
    } finally { clearTimeout(timer); }
  }
}
