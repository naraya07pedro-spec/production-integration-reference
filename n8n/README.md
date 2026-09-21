# Inactive synthetic n8n demo

[workflow.sanitized.json](workflow.sanitized.json) is an authored orchestration example,
not an exported private/production workflow and not proof of a successful n8n execution.

Manual trigger → serialize one synthetic event → per-body HMAC → reference HTTP service.
No inbound public webhook is exposed by this demo. It cannot become an unauthenticated signing proxy.

## Setup required

1. Import into a non-production n8n version supporting **Crypto node v2**.
2. Bind a private Crypto credential with its HMAC secret equal to the service's WEBHOOK_SECRET.
   Credential references and values are deliberately absent from this export.
3. Set Integration Service's URL to the reference server reachable from the n8n host.
   The localhost default only works when they share a network namespace. Containers need
   an explicitly configured host/service address. Use HTTPS outside local development.
4. Run the reference server with a disposable DB and a mock receiver; execute manually.
5. Inspect the real execution result. Re-running the same fixture should return duplicate.
   Use a new synthetic event ID for a new independent event.

The Crypto node signs the exact rawBody string sent by HTTP. A static signature environment
variable would only match one exact payload and is not used.
Only TypeScript owns retry policy and durable reservation; n8n node-level retries are not enabled.

The Crypto v2 configuration was inspected against
[upstream source](https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/Crypto/v2/CryptoV2.node.ts).
JSON structure is tested; import, credential binding and execution remain **MANUAL_REQUIRED**.
No n8n runtime was accessible during this audit. See [evidence status](../docs/evidence/README.md).
