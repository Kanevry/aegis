import os from "node:os";
import path from "node:path";
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomUUID,
  sign as signDetached,
} from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const STORE_DIR = path.join(os.tmpdir(), "aegis-openclaw-runtime");
const STORE_PATH = path.join(STORE_DIR, "approval-requests.json");
const BRIDGE_IDENTITY_PATH = path.join(STORE_DIR, "bridge-device.json");
const CONTRACT_VERSION = "2026-04-18";
const PROTOCOL_VERSION = 3;
const WS_CONNECT_TIMEOUT_MS = 10_000;
const WS_RECONNECT_DELAY_MS = 2_000;

const runtimeApprovalStatusSchema = z.enum([
  "pending",
  "approved",
  "denied",
  "expired",
]);

export const runtimeApprovalDecisionSchema = z.enum([
  "allow-once",
  "allow-always",
  "deny",
]);

export const runtimeApprovalRequestSchema = z.object({
  approvalId: z.string().min(1),
  commandText: z.string().min(1),
  commandPreview: z.string().min(1).optional(),
  commandArgv: z.array(z.string()).optional(),
  systemRunPlan: z.record(z.string(), z.unknown()).nullable().optional(),
  cwd: z.string().nullable().optional(),
  agentId: z.string().nullable().optional(),
  sessionKey: z.string().nullable().optional(),
  nodeId: z.string().nullable().optional(),
  host: z.string().nullable().optional(),
  security: z.string().nullable().optional(),
  ask: z.string().nullable().optional(),
  envKeys: z.array(z.string()).default([]),
  createdAtMs: z.number().int().nonnegative(),
  expiresAtMs: z.number().int().nonnegative(),
});

export const runtimeDecisionRequestSchema = z.object({
  decision: runtimeApprovalDecisionSchema,
  resolvedBy: z.string().min(1),
  source: z.string().min(1).default("aegis-web"),
});

export const runtimeApprovalRecordSchema = runtimeApprovalRequestSchema.extend({
  status: runtimeApprovalStatusSchema,
  decision: runtimeApprovalDecisionSchema.nullable(),
  resolvedAtMs: z.number().int().nonnegative().nullable(),
  resolvedBy: z.string().nullable(),
  source: z.string().nullable(),
  uiUrl: z.string(),
  lastBridgeError: z.string().nullable(),
  updatedAtMs: z.number().int().nonnegative(),
});

export type RuntimeApprovalRequest = z.infer<typeof runtimeApprovalRequestSchema>;
export type RuntimeApprovalDecision = z.infer<typeof runtimeApprovalDecisionSchema>;
export type RuntimeApprovalRecord = z.infer<typeof runtimeApprovalRecordSchema>;

const storeSchema = z.object({
  version: z.literal(1),
  approvals: z.record(z.string(), runtimeApprovalRecordSchema),
});

type RuntimeApprovalStore = z.infer<typeof storeSchema>;

type StoredDeviceIdentity = {
  version: 1;
  deviceId: string;
  publicKeyPem: string;
  privateKeyPem: string;
  createdAtMs: number;
};

type DeviceIdentity = {
  deviceId: string;
  publicKeyPem: string;
  privateKeyPem: string;
};

type GatewayPendingRpc = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

type GatewayBridgeState = {
  started: boolean;
  connected: boolean;
  socket: WebSocket | null;
  connectRequestId: string | null;
  connectPromise: Promise<void> | null;
  connectResolve: (() => void) | null;
  connectReject: ((error: Error) => void) | null;
  reconnectTimer: NodeJS.Timeout | null;
  pendingRpc: Map<string, GatewayPendingRpc>;
  lastError: string | null;
};

const EMPTY_STORE: RuntimeApprovalStore = {
  version: 1,
  approvals: {},
};

function getBridgeState(): GatewayBridgeState {
  const globalState = globalThis as typeof globalThis & {
    __aegisOpenclawBridge?: GatewayBridgeState;
  };

  if (!globalState.__aegisOpenclawBridge) {
    globalState.__aegisOpenclawBridge = {
      started: false,
      connected: false,
      socket: null,
      connectRequestId: null,
      connectPromise: null,
      connectResolve: null,
      connectReject: null,
      reconnectTimer: null,
      pendingRpc: new Map(),
      lastError: null,
    };
  }

  return globalState.__aegisOpenclawBridge;
}

async function ensureStoreDir() {
  await mkdir(STORE_DIR, { recursive: true });
}

async function readStore(): Promise<RuntimeApprovalStore> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    return storeSchema.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return EMPTY_STORE;
    }
    throw error;
  }
}

async function writeStore(store: RuntimeApprovalStore): Promise<void> {
  await ensureStoreDir();
  await writeFile(STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function buildUiUrl(approvalId: string) {
  return `/approvals/${encodeURIComponent(approvalId)}`;
}

function nowMs() {
  return Date.now();
}

function sortByNewest(items: RuntimeApprovalRecord[]) {
  return [...items].sort((a, b) => b.createdAtMs - a.createdAtMs);
}

function base64UrlEncode(buf: Buffer) {
  return buf
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

function derivePublicKeyRaw(publicKeyPem: string) {
  const key = createPublicKey(publicKeyPem);
  const spki = key.export({ type: "spki", format: "der" }) as Buffer;
  const ed25519SpkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
  if (
    spki.length === ed25519SpkiPrefix.length + 32 &&
    spki.subarray(0, ed25519SpkiPrefix.length).equals(ed25519SpkiPrefix)
  ) {
    return spki.subarray(ed25519SpkiPrefix.length);
  }
  return spki;
}

function fingerprintPublicKey(publicKeyPem: string) {
  return createHash("sha256").update(derivePublicKeyRaw(publicKeyPem)).digest("hex");
}

async function loadOrCreateBridgeIdentity(): Promise<DeviceIdentity> {
  try {
    const raw = await readFile(BRIDGE_IDENTITY_PATH, "utf8");
    const parsed = JSON.parse(raw) as StoredDeviceIdentity;
    if (
      parsed?.version === 1 &&
      typeof parsed.deviceId === "string" &&
      typeof parsed.publicKeyPem === "string" &&
      typeof parsed.privateKeyPem === "string"
    ) {
      return {
        deviceId: parsed.deviceId,
        publicKeyPem: parsed.publicKeyPem,
        privateKeyPem: parsed.privateKeyPem,
      };
    }
  } catch {
    // Regenerate below.
  }

  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const identity = {
    deviceId: fingerprintPublicKey(publicKeyPem),
    publicKeyPem,
    privateKeyPem,
  };

  await ensureStoreDir();
  await writeFile(
    BRIDGE_IDENTITY_PATH,
    `${JSON.stringify(
      {
        version: 1,
        ...identity,
        createdAtMs: nowMs(),
      } satisfies StoredDeviceIdentity,
      null,
      2,
    )}\n`,
    "utf8",
  );

  return identity;
}

function buildDeviceAuthPayloadV3(params: {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token: string | null;
  nonce: string;
  platform: string;
  deviceFamily: string;
}) {
  return [
    "v3",
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    params.scopes.join(","),
    String(params.signedAtMs),
    params.token ?? "",
    params.nonce,
    params.platform.trim().toLowerCase(),
    params.deviceFamily.trim().toLowerCase(),
  ].join("|");
}

function signDevicePayload(privateKeyPem: string, payload: string) {
  return base64UrlEncode(
    signDetached(null, Buffer.from(payload, "utf8"), createPrivateKey(privateKeyPem)),
  );
}

function publicKeyRawBase64UrlFromPem(publicKeyPem: string) {
  return base64UrlEncode(derivePublicKeyRaw(publicKeyPem));
}

function resolveOpenclawGatewayConfig() {
  const baseURL =
    process.env["AEGIS_EXPECTED_OPENCLAW_GATEWAY_URL"] ||
    process.env["OPENCLAW_BASE_URL"] ||
    "http://localhost:18789";
  const apiToken =
    process.env["AEGIS_EXPECTED_OPENCLAW_GATEWAY_TOKEN"] ||
    process.env["OPENCLAW_GATEWAY_TOKEN"] ||
    process.env["OPENCLAW_API_TOKEN"] ||
    "";
  const origin =
    process.env["AEGIS_WEB_BASE_URL"] ||
    process.env["NEXT_PUBLIC_APP_URL"] ||
    "http://localhost:3000";

  return { baseURL, apiToken, origin };
}

function toGatewayWsUrl(baseURL: string) {
  if (baseURL.startsWith("ws://") || baseURL.startsWith("wss://")) {
    return baseURL;
  }
  if (baseURL.startsWith("https://")) {
    return `wss://${baseURL.slice("https://".length)}`;
  }
  if (baseURL.startsWith("http://")) {
    return `ws://${baseURL.slice("http://".length)}`;
  }
  return `ws://${baseURL}`;
}

function resolveConnectClientInfo() {
  return {
    id: "openclaw-control-ui",
    displayName: "Ægis Runtime Bridge",
    version: process.env["npm_package_version"] ?? "0.1.0",
    platform: "web",
    mode: "webchat",
    deviceFamily: "browser",
    instanceId: "aegis-runtime-bridge",
  };
}

async function mirrorGatewayApprovalRequested(payload: unknown) {
  const data = payload as
    | {
        id?: string;
        createdAtMs?: number;
        expiresAtMs?: number;
        request?: {
          command?: string;
          commandPreview?: string | null;
          commandArgv?: string[];
          systemRunPlan?: Record<string, unknown> | null;
          cwd?: string | null;
          agentId?: string | null;
          sessionKey?: string | null;
          nodeId?: string | null;
          host?: string | null;
          security?: string | null;
          ask?: string | null;
          envKeys?: string[];
        };
      }
    | undefined;

  if (!data?.id || !data.request?.command) {
    return;
  }

  await upsertRuntimeApprovalRequest({
    approvalId: data.id,
    commandText: data.request.command,
    commandPreview: data.request.commandPreview ?? undefined,
    commandArgv: data.request.commandArgv,
    systemRunPlan: data.request.systemRunPlan ?? null,
    cwd: data.request.cwd ?? null,
    agentId: data.request.agentId ?? null,
    sessionKey: data.request.sessionKey ?? null,
    nodeId: data.request.nodeId ?? null,
    host: data.request.host ?? null,
    security: data.request.security ?? null,
    ask: data.request.ask ?? null,
    envKeys: data.request.envKeys ?? [],
    createdAtMs: typeof data.createdAtMs === "number" ? data.createdAtMs : nowMs(),
    expiresAtMs:
      typeof data.expiresAtMs === "number" ? data.expiresAtMs : nowMs() + 120_000,
  });
}

async function mirrorGatewayApprovalResolved(payload: unknown) {
  const data = payload as
    | {
        id?: string;
        decision?: string;
        resolvedBy?: string | null;
        ts?: number;
      }
    | undefined;
  if (!data?.id || !data.decision) {
    return;
  }

  const store = await readStore();
  const approval = store.approvals[data.id];
  if (!approval) {
    return;
  }

  const decision = data.decision === "deny" ? "deny" : data.decision;
  if (
    decision !== "allow-once" &&
    decision !== "allow-always" &&
    decision !== "deny"
  ) {
    return;
  }

  store.approvals[data.id] = runtimeApprovalRecordSchema.parse({
    ...approval,
    status: decision.startsWith("allow") ? "approved" : "denied",
    decision,
    resolvedBy: data.resolvedBy ?? approval.resolvedBy,
    resolvedAtMs: typeof data.ts === "number" ? data.ts : nowMs(),
    source: approval.source ?? "openclaw-gateway",
    lastBridgeError: null,
    updatedAtMs: nowMs(),
  });
  await writeStore(store);
}

function cleanupPendingRpc(state: GatewayBridgeState, id: string, error?: Error) {
  const pending = state.pendingRpc.get(id);
  if (!pending) {
    return;
  }
  clearTimeout(pending.timeout);
  state.pendingRpc.delete(id);
  if (error) {
    pending.reject(error);
  }
}

function scheduleBridgeReconnect() {
  const state = getBridgeState();
  if (state.reconnectTimer) {
    return;
  }
  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null;
    void ensureOpenclawRuntimeBridgeStarted().catch(() => undefined);
  }, WS_RECONNECT_DELAY_MS);
  state.reconnectTimer.unref?.();
}

function closeBridgeSocket(state: GatewayBridgeState) {
  if (state.socket) {
    try {
      state.socket.close();
    } catch {
      // Ignore best-effort socket shutdown.
    }
  }
  state.socket = null;
  state.connected = false;
}

async function sendGatewayConnectFrame(state: GatewayBridgeState, nonce: string) {
  const { apiToken } = resolveOpenclawGatewayConfig();
  if (!apiToken) {
    throw new Error("OpenClaw gateway token is not configured for bridge startup");
  }
  const client = resolveConnectClientInfo();
  const identity = await loadOrCreateBridgeIdentity();
  const signedAtMs = nowMs();
  const scopes = ["operator.approvals"];
  const payload = buildDeviceAuthPayloadV3({
    deviceId: identity.deviceId,
    clientId: client.id,
    clientMode: client.mode,
    role: "operator",
    scopes,
    signedAtMs,
    token: apiToken,
    nonce,
    platform: client.platform,
    deviceFamily: client.deviceFamily,
  });

  state.connectRequestId = randomUUID();
  state.socket?.send(
    JSON.stringify({
      type: "req",
      id: state.connectRequestId,
      method: "connect",
      params: {
        minProtocol: PROTOCOL_VERSION,
        maxProtocol: PROTOCOL_VERSION,
        client,
        role: "operator",
        scopes,
        caps: [],
        auth: { token: apiToken },
        device: {
          id: identity.deviceId,
          publicKey: publicKeyRawBase64UrlFromPem(identity.publicKeyPem),
          signature: signDevicePayload(identity.privateKeyPem, payload),
          signedAt: signedAtMs,
          nonce,
        },
      },
    }),
  );
}

function parseSocketMessage(event: MessageEvent) {
  const raw =
    typeof event.data === "string"
      ? event.data
      : event.data instanceof ArrayBuffer
        ? Buffer.from(event.data).toString("utf8")
        : String(event.data);
  return JSON.parse(raw) as Record<string, unknown>;
}

async function handleGatewayBridgeMessage(message: Record<string, unknown>) {
  const state = getBridgeState();

  if (
    message.type === "res" &&
    typeof message.id === "string" &&
    message.id === state.connectRequestId
  ) {
    if (message.ok === true) {
      state.connected = true;
      state.lastError = null;
      state.connectResolve?.();
    } else {
      const error = new Error(
        typeof message.error === "object" && message.error
          ? ((message.error as { message?: unknown }).message as string) ||
            "OpenClaw gateway connect failed"
          : "OpenClaw gateway connect failed",
      );
      state.lastError = error.message;
      state.connectReject?.(error);
      closeBridgeSocket(state);
      scheduleBridgeReconnect();
    }
    state.connectRequestId = null;
    state.connectPromise = null;
    state.connectResolve = null;
    state.connectReject = null;
    return;
  }

  if (message.type === "res" && typeof message.id === "string") {
    const pending = state.pendingRpc.get(message.id);
    if (!pending) {
      return;
    }
    clearTimeout(pending.timeout);
    state.pendingRpc.delete(message.id);
    if (message.ok === true) {
      pending.resolve(message.payload);
    } else {
      const error = new Error(
        typeof message.error === "object" && message.error
          ? ((message.error as { message?: unknown }).message as string) ||
            "OpenClaw RPC failed"
          : "OpenClaw RPC failed",
      );
      pending.reject(error);
    }
    return;
  }

  if (message.type === "event" && message.event === "exec.approval.requested") {
    await mirrorGatewayApprovalRequested(message.payload);
    return;
  }

  if (message.type === "event" && message.event === "exec.approval.resolved") {
    await mirrorGatewayApprovalResolved(message.payload);
  }
}

export async function ensureOpenclawRuntimeBridgeStarted(): Promise<void> {
  const state = getBridgeState();
  if (state.connected) {
    return;
  }
  if (state.connectPromise) {
    return await state.connectPromise;
  }

  const { apiToken, baseURL, origin } = resolveOpenclawGatewayConfig();
  if (!apiToken) {
    throw new Error("OpenClaw gateway token is not configured for bridge startup");
  }

  state.started = true;
  state.connectPromise = new Promise<void>((resolve, reject) => {
    state.connectResolve = resolve;
    state.connectReject = reject;
  });
  void state.connectPromise.catch(() => undefined);

  const wsUrl = toGatewayWsUrl(baseURL);
  const socket = new WebSocket(wsUrl, {
    headers: {
      origin,
    },
  });
  state.socket = socket;

  const timeout = setTimeout(() => {
    state.lastError = "Timed out while connecting Ægis runtime bridge to OpenClaw";
    state.connectReject?.(new Error(state.lastError));
    state.connectPromise = null;
    state.connectResolve = null;
    state.connectReject = null;
    closeBridgeSocket(state);
    scheduleBridgeReconnect();
  }, WS_CONNECT_TIMEOUT_MS);
  timeout.unref?.();

  socket.addEventListener("open", () => {
    void sendGatewayConnectFrame(state, randomUUID()).catch((error) => {
      state.lastError = error instanceof Error ? error.message : String(error);
      state.connectReject?.(
        error instanceof Error ? error : new Error("OpenClaw gateway connect failed"),
      );
      state.connectPromise = null;
      state.connectResolve = null;
      state.connectReject = null;
      closeBridgeSocket(state);
      scheduleBridgeReconnect();
    });
  });

  socket.addEventListener("message", (event) => {
    void handleGatewayBridgeMessage(parseSocketMessage(event)).catch((error) => {
      state.lastError = error instanceof Error ? error.message : String(error);
      Sentry.captureException(error);
    });
  });

  socket.addEventListener("close", () => {
    clearTimeout(timeout);
    state.lastError = "OpenClaw gateway bridge closed during connect";
    for (const [id] of state.pendingRpc) {
      cleanupPendingRpc(state, id, new Error("OpenClaw gateway bridge disconnected"));
    }
    state.connected = false;
    state.socket = null;
    if (state.connectPromise) {
      state.connectReject?.(new Error("OpenClaw gateway bridge closed during connect"));
      state.connectPromise = null;
      state.connectResolve = null;
      state.connectReject = null;
    }
    scheduleBridgeReconnect();
  });

  socket.addEventListener("error", () => {
    clearTimeout(timeout);
  });

  try {
    await state.connectPromise;
    clearTimeout(timeout);
  } finally {
    clearTimeout(timeout);
  }
}

async function callGatewayRpc<T = unknown>(method: string, params: unknown): Promise<T> {
  await ensureOpenclawRuntimeBridgeStarted();
  const state = getBridgeState();
  if (!state.socket || !state.connected) {
    throw new Error("OpenClaw runtime bridge is not connected");
  }

  const id = randomUUID();
  const result = new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      state.pendingRpc.delete(id);
      reject(new Error(`OpenClaw RPC timed out: ${method}`));
    }, 15_000);
    timeout.unref?.();
    state.pendingRpc.set(id, { resolve: resolve as (value: unknown) => void, reject, timeout });
  });

  state.socket.send(
    JSON.stringify({
      type: "req",
      id,
      method,
      params,
    }),
  );

  return await result;
}

function toStoredStatus(decision: RuntimeApprovalDecision): RuntimeApprovalRecord["status"] {
  return decision.startsWith("allow") ? "approved" : "denied";
}

export function authorizeOpenclawRuntimeRequest(req: NextRequest) {
  const expectedToken = process.env["AEGIS_SHARED_TOKEN"]?.trim();
  if (!expectedToken) {
    return NextResponse.json(
      { error: "runtime_bridge_not_configured" },
      { status: 503 },
    );
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return null;
}

export async function upsertRuntimeApprovalRequest(
  input: RuntimeApprovalRequest,
): Promise<RuntimeApprovalRecord> {
  const parsed = runtimeApprovalRequestSchema.parse(input);
  const store = await readStore();
  const existing = store.approvals[parsed.approvalId];
  const updatedAtMs = nowMs();

  const nextRecord = runtimeApprovalRecordSchema.parse({
    ...existing,
    ...parsed,
    status: existing?.status ?? "pending",
    decision: existing?.decision ?? null,
    resolvedAtMs: existing?.resolvedAtMs ?? null,
    resolvedBy: existing?.resolvedBy ?? null,
    source: existing?.source ?? null,
    lastBridgeError: existing?.lastBridgeError ?? null,
    updatedAtMs,
    uiUrl: existing?.uiUrl ?? buildUiUrl(parsed.approvalId),
  });

  store.approvals[parsed.approvalId] = nextRecord;
  await writeStore(store);

  return nextRecord;
}

export async function listRuntimeApprovals(params?: {
  status?: RuntimeApprovalRecord["status"];
}): Promise<RuntimeApprovalRecord[]> {
  const store = await readStore();
  const items = Object.values(store.approvals);
  const filtered = params?.status
    ? items.filter((item) => item.status === params.status)
    : items;
  return sortByNewest(filtered);
}

export async function getRuntimeApproval(
  approvalId: string,
): Promise<RuntimeApprovalRecord | null> {
  const store = await readStore();
  return store.approvals[approvalId] ?? null;
}

export async function resolveRuntimeApprovalRequest(input: {
  approvalId: string;
  decision: RuntimeApprovalDecision;
  resolvedBy: string;
  source: string;
}): Promise<RuntimeApprovalRecord> {
  const store = await readStore();
  const approval = store.approvals[input.approvalId];

  if (!approval) {
    throw new Error(`Approval ${input.approvalId} was not found in Ægis`);
  }

  if (approval.status !== "pending") {
    return approval;
  }

  return await Sentry.startSpan(
    {
      op: "aegis.openclaw.approval.resolve",
      name: "resolve runtime approval",
      attributes: {
        "aegis.approval_id": approval.approvalId,
        "aegis.session_key": approval.sessionKey ?? "",
        "aegis.agent_id": approval.agentId ?? "",
        "aegis.host": approval.host ?? "",
        "aegis.node_id": approval.nodeId ?? "",
        "aegis.outcome": input.decision,
      },
    },
    async () => {
      try {
        await callGatewayRpc("exec.approval.resolve", {
          id: approval.approvalId,
          decision: input.decision,
        });

        const resolved = runtimeApprovalRecordSchema.parse({
          ...approval,
          status: toStoredStatus(input.decision),
          decision: input.decision,
          resolvedAtMs: nowMs(),
          resolvedBy: input.resolvedBy,
          source: input.source,
          lastBridgeError: null,
          updatedAtMs: nowMs(),
        });

        store.approvals[input.approvalId] = resolved;
        await writeStore(store);
        return resolved;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown OpenClaw resolution error";
        const pending = runtimeApprovalRecordSchema.parse({
          ...approval,
          lastBridgeError: message,
          updatedAtMs: nowMs(),
        });
        store.approvals[input.approvalId] = pending;
        await writeStore(store);

        Sentry.captureException(error, {
          tags: {
            "aegis.approval_id": approval.approvalId,
            "aegis.outcome": "bridge-error",
          },
        });
        throw error;
      }
    },
  );
}

export async function expireRuntimeApprovalIfNeeded(
  approvalId: string,
): Promise<RuntimeApprovalRecord | null> {
  const store = await readStore();
  const approval = store.approvals[approvalId];
  if (!approval) {
    return null;
  }
  if (approval.status !== "pending" || approval.expiresAtMs > nowMs()) {
    return approval;
  }

  const expired = runtimeApprovalRecordSchema.parse({
    ...approval,
    status: "expired",
    updatedAtMs: nowMs(),
  });
  store.approvals[approvalId] = expired;
  await writeStore(store);
  return expired;
}

export async function expirePendingRuntimeApprovals(): Promise<void> {
  const store = await readStore();
  let dirty = false;
  const cutoff = nowMs();

  for (const approval of Object.values(store.approvals)) {
    if (approval.status === "pending" && approval.expiresAtMs <= cutoff) {
      store.approvals[approval.approvalId] = runtimeApprovalRecordSchema.parse({
        ...approval,
        status: "expired",
        updatedAtMs: cutoff,
      });
      dirty = true;
    }
  }

  if (dirty) {
    await writeStore(store);
  }
}

export function buildRuntimeHealthPayload() {
  const state = getBridgeState();
  return {
    status: "ok",
    service: "aegis-runtime",
    openclawBridge: {
      enabled: true,
      contractVersion: CONTRACT_VERSION,
      connected: state.connected,
      lastError: state.lastError,
    },
  } as const;
}
