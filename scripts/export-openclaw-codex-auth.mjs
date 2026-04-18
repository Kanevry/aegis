#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_SOURCE = path.join(process.env.HOME || "", ".pi", "agent", "auth.json");
const DEFAULT_SEED_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  "docker",
  "openclaw-auth-seed",
);
const DEFAULT_PROFILE_ID = "openai-codex:default";

function usage() {
  console.error(
    "Usage: node scripts/export-openclaw-codex-auth.mjs [--source PATH] [--agent-dir PATH] [--profile-id ID]",
  );
}

function parseArgs(argv) {
  const args = {
    source: DEFAULT_SOURCE,
    agentDir: DEFAULT_SEED_DIR,
    profileId: DEFAULT_PROFILE_ID,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--source") {
      args.source = argv[index + 1] || "";
      index += 1;
      continue;
    }
    if (value === "--agent-dir") {
      args.agentDir = argv[index + 1] || "";
      index += 1;
      continue;
    }
    if (value === "--profile-id") {
      args.profileId = argv[index + 1] || "";
      index += 1;
      continue;
    }
    if (value === "--help" || value === "-h") {
      usage();
      process.exit(0);
    }
    usage();
    throw new Error(`Unknown argument: ${value}`);
  }

  if (!args.source || !args.agentDir || !args.profileId) {
    usage();
    throw new Error("source, agent-dir, and profile-id must be non-empty");
  }

  return args;
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function validateCodexCredential(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("openai-codex entry is missing");
  }

  const access = typeof raw.access === "string" ? raw.access.trim() : "";
  const refresh = typeof raw.refresh === "string" ? raw.refresh.trim() : "";
  const expires = Number(raw.expires);

  if (!access || !refresh || !Number.isFinite(expires) || expires <= 0) {
    throw new Error("openai-codex entry must include access, refresh, and expires");
  }

  return {
    type: "oauth",
    provider: "openai-codex",
    access,
    refresh,
    expires,
    ...(typeof raw.accountId === "string" && raw.accountId.trim()
      ? { accountId: raw.accountId.trim() }
      : {}),
    ...(typeof raw.email === "string" && raw.email.trim() ? { email: raw.email.trim() } : {}),
    ...(typeof raw.clientId === "string" && raw.clientId.trim()
      ? { clientId: raw.clientId.trim() }
      : {}),
  };
}

async function main() {
  const { source, agentDir, profileId } = parseArgs(process.argv.slice(2));
  const sourceJson = await readJson(source, null);
  if (!sourceJson || typeof sourceJson !== "object") {
    throw new Error(`Could not parse source auth JSON at ${source}`);
  }

  const codexCredential = validateCodexCredential(sourceJson["openai-codex"]);
  const authStorePath = path.join(agentDir, "auth-profiles.json");
  const authJsonPath = path.join(agentDir, "auth.json");
  const authStore = await readJson(authStorePath, { version: 1, profiles: {}, order: {} });

  authStore.version = 1;
  authStore.profiles =
    authStore.profiles && typeof authStore.profiles === "object" ? authStore.profiles : {};
  authStore.order = authStore.order && typeof authStore.order === "object" ? authStore.order : {};
  authStore.profiles[profileId] = codexCredential;
  authStore.order["openai-codex"] = [
    profileId,
    ...(
      Array.isArray(authStore.order["openai-codex"]) ? authStore.order["openai-codex"] : []
    ).filter((entry) => entry !== profileId),
  ];

  const legacyAuthJson = await readJson(authJsonPath, {});
  legacyAuthJson["openai-codex"] = {
    type: "oauth",
    access: codexCredential.access,
    refresh: codexCredential.refresh,
    expires: codexCredential.expires,
    ...(typeof codexCredential.accountId === "string" && codexCredential.accountId
      ? { accountId: codexCredential.accountId }
      : {}),
  };

  await fs.mkdir(agentDir, { recursive: true });
  await fs.writeFile(authStorePath, `${JSON.stringify(authStore, null, 2)}\n`, { mode: 0o600 });
  await fs.writeFile(authJsonPath, `${JSON.stringify(legacyAuthJson, null, 2)}\n`, { mode: 0o600 });

  console.log(`Exported OpenClaw Codex auth seed to ${agentDir}`);
  console.log(`- source: ${source}`);
  console.log(`- profile: ${profileId}`);
  console.log(`- files: auth-profiles.json, auth.json`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
