# Aegis <-> OpenClaw Runtime Contract

This file defines the expected Aegis interfaces for the local Docker stack in this repository.

It treats OpenClaw as the source of truth for:

- approval request registration,
- pending approval lifecycle,
- approval binding to `argv`, `cwd`, `agentId`, `sessionKey`, and env hash,
- resume/deny semantics for the blocked OpenClaw run.

Aegis is expected to provide:

- operator-facing approval APIs,
- a web UI for pending requests,
- Sentry instrumentation and policy evaluation,
- backend logic that resolves the original OpenClaw approval request by its existing `approvalId`.

## Shared Auth

All OpenClaw -> Aegis runtime calls use:

- `Authorization: Bearer ${AEGIS_SHARED_TOKEN}`

## 1. Health Check

### Request

```http
GET /api/runtime/openclaw/health
Authorization: Bearer <AEGIS_SHARED_TOKEN>
```

### Expected Response

```json
{
  "status": "ok",
  "service": "aegis-runtime",
  "openclawBridge": {
    "enabled": true,
    "contractVersion": "2026-04-18"
  }
}
```

## 2. Mirror a Pending OpenClaw Approval Request

### Request

```http
POST /api/runtime/openclaw/approval-requests
Authorization: Bearer <AEGIS_SHARED_TOKEN>
Content-Type: application/json
```

### Request Body

```json
{
  "approvalId": "4db4b2e7-f2bb-4d70-a0f0-8de7d1f4f21b",
  "commandText": "bash -lc 'git status'",
  "commandPreview": "git status",
  "commandArgv": ["bash", "-lc", "git status"],
  "systemRunPlan": {
    "argv": ["bash", "-lc", "git status"],
    "cwd": "/workspace",
    "commandText": "bash -lc 'git status'",
    "commandPreview": "git status",
    "agentId": "main",
    "sessionKey": "agent:main:webchat:session:demo"
  },
  "cwd": "/workspace",
  "agentId": "main",
  "sessionKey": "agent:main:webchat:session:demo",
  "nodeId": null,
  "host": "gateway",
  "security": "allowlist",
  "ask": "on-miss",
  "envKeys": ["TERM"],
  "createdAtMs": 1776500000000,
  "expiresAtMs": 1776500120000
}
```

### Expected Response

```json
{
  "status": "accepted",
  "approvalId": "4db4b2e7-f2bb-4d70-a0f0-8de7d1f4f21b",
  "uiUrl": "/approvals/4db4b2e7-f2bb-4d70-a0f0-8de7d1f4f21b"
}
```

### Semantics

- The operation must be idempotent for the same `approvalId`.
- Aegis must not create its own replacement approval identifier for the normal path.
- Aegis stores the OpenClaw `approvalId` as the stable correlation key.

## 3. List Pending Approval Requests for the Aegis UI

### Request

```http
GET /api/runtime/openclaw/approval-requests?status=pending
Authorization: Bearer <AEGIS_SHARED_TOKEN>
```

### Expected Response

```json
{
  "items": [
    {
      "approvalId": "4db4b2e7-f2bb-4d70-a0f0-8de7d1f4f21b",
      "status": "pending",
      "commandText": "bash -lc 'git status'",
      "commandPreview": "git status",
      "cwd": "/workspace",
      "agentId": "main",
      "sessionKey": "agent:main:webchat:session:demo",
      "host": "gateway",
      "nodeId": null,
      "envKeys": ["TERM"],
      "createdAtMs": 1776500000000,
      "expiresAtMs": 1776500120000
    }
  ]
}
```

## 4. Submit a Decision from the Aegis UI/Backend

This is the Aegis-side write endpoint used by the Aegis UI. The Aegis backend is expected to take this decision and call the OpenClaw gateway's `exec.approval.resolve` RPC with the same `approvalId`.

### Request

```http
POST /api/runtime/openclaw/approval-requests/4db4b2e7-f2bb-4d70-a0f0-8de7d1f4f21b/decisions
Authorization: Bearer <AEGIS_SHARED_TOKEN>
Content-Type: application/json
```

### Request Body

```json
{
  "decision": "allow-once",
  "resolvedBy": "operator@example.local",
  "source": "aegis-web"
}
```

### Expected Response

```json
{
  "status": "resolved",
  "approvalId": "4db4b2e7-f2bb-4d70-a0f0-8de7d1f4f21b",
  "decision": "allow-once"
}
```

### Semantics

- Valid decisions:
  - `allow-once`
  - `allow-always`
  - `deny`
- Aegis must resolve the exact original OpenClaw request, not execute the command directly.
- If the OpenClaw approval is expired, consumed, or mismatched, Aegis should surface a deterministic failure state.

## 5. Optional UI/Event Stream

If Aegis supports live updates for the web UI, the Docker stack assumes one of:

- `GET /api/runtime/openclaw/events` using SSE, or
- `GET /ws/openclaw/approvals` using WebSocket

That stream should publish at least:

- approval created
- approval resolved
- approval expired
- bridge error

## Expected Sentry Fields

When Aegis handles the above contract, it is expected to attach safe attributes such as:

- `aegis.approval_id`
- `aegis.session_key`
- `aegis.agent_id`
- `aegis.host`
- `aegis.node_id`
- `aegis.command_risk`
- `aegis.outcome`

Raw env values and secrets must never be shipped.

