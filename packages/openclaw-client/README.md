# @aegis/openclaw-client

Typed client for the OpenClaw Gateway. Three responsibilities:

1. **`chatModel(agentId?)`** — returns a `LanguageModelV2` compatible with the Vercel AI SDK (via `@ai-sdk/openai-compatible`).
2. **`resolveApproval({ approvalId, decision, rejectionMessage? })`** — POSTs to `/exec/approval/resolve` to approve/deny a pending exec approval.
3. **`verifyWebhookSignature(rawBody, headerValue, secret)`** — constant-time HMAC-SHA256 verification of inbound webhook events.

## Usage

```ts
import { createOpenclawClient, verifyWebhookSignature } from "@aegis/openclaw-client";

const oc = createOpenclawClient({
  baseURL: process.env.OPENCLAW_BASE_URL!,
  apiToken: process.env.OPENCLAW_API_TOKEN!,
  defaultAgentId: process.env.OPENCLAW_AGENT_ID,
});

// 1. Chat model (Vercel AI SDK)
const model = oc.chatModel();

// 2. Resolve approval
await oc.resolveApproval({ approvalId: "abc", decision: "allow-once" });

// 3. Webhook verification (in your route handler)
const ok = verifyWebhookSignature(
  rawBody,
  req.headers.get("x-openclaw-signature"),
  process.env.OPENCLAW_WEBHOOK_SECRET!,
);
```
