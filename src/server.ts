import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { processLeadEvent } from "./handler.js";
import { FetchDownstreamClient } from "./http-client.js";
import { PostgresIdempotencyStore } from "./idempotency.js";
import type { DownstreamClient, IdempotencyStore, Logger } from "./types.js";
import { verifyWebhookSignature } from "./webhook.js";

export function createIntegrationServer(deps: {
  store: IdempotencyStore; downstream: DownstreamClient; logger: Logger; webhookSecret: string;
}) {
  const server = createServer(async (req, res) => {
    const reply = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.method !== "POST" || req.url !== "/events/lead") { reply(404, { error: "not_found" }); return; }
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 65536) { reply(413, { error: "payload_too_large" }); return; }
        chunks.push(Buffer.from(chunk));
      }
      const rawBody = Buffer.concat(chunks);
      const signature = req.headers["x-webhook-signature"];
      if (typeof signature !== "string" || !verifyWebhookSignature(rawBody, signature, deps.webhookSecret)) {
        reply(401, { error: "invalid_signature" }); return;
      }
      let payload: unknown;
      try { payload = JSON.parse(rawBody.toString("utf8")); }
      catch { reply(400, { error: "invalid_json" }); return; }
      const result = await processLeadEvent(payload, deps);
      reply(result.status === "blocked" ? 422 : 200, result);
    } catch {
      deps.logger.error("request_failed", { reason: "processing_failed" });
      if (!res.headersSent) reply(500, { error: "processing_failed" });
      else res.end();
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { DATABASE_URL, WEBHOOK_SECRET, DOWNSTREAM_URL, DOWNSTREAM_TOKEN } = process.env;
  if (!DATABASE_URL || !WEBHOOK_SECRET || !DOWNSTREAM_URL || !DOWNSTREAM_TOKEN)
    throw new Error("DATABASE_URL, WEBHOOK_SECRET, DOWNSTREAM_URL and DOWNSTREAM_TOKEN are required");
  const pool = new Pool({ connectionString: DATABASE_URL, connectionTimeoutMillis: 5000, query_timeout: 5000 });
  const logger: Logger = {
    info: (event, fields = {}) => console.log(JSON.stringify({ level: "info", event, ...fields })),
    error: (event, fields = {}) => console.error(JSON.stringify({ level: "error", event, ...fields })),
  };
  pool.on("error", () => logger.error("database_pool_error"));
  const server = createIntegrationServer({ store: new PostgresIdempotencyStore(pool),
    downstream: new FetchDownstreamClient(DOWNSTREAM_URL, DOWNSTREAM_TOKEN), logger, webhookSecret: WEBHOOK_SECRET });
  server.listen(Number(process.env.PORT ?? 3000), () => logger.info("server_started"));
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => {
    server.close(() => { void pool.end(); });
  });
}
