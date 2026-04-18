#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { ROOT_DIR, readEnvFile, resolveDockerEnvFile } from "./docker-openclaw-env.mjs";

const envFile = resolveDockerEnvFile();
const envValues = {
  ...readEnvFile(envFile),
  ...process.env,
};

const port = envValues.OPENCLAW_GATEWAY_PORT || "18789";
const token = envValues.OPENCLAW_GATEWAY_TOKEN;
if (!token) {
  throw new Error(`Missing OPENCLAW_GATEWAY_TOKEN in ${path.relative(ROOT_DIR, envFile)}`);
}

const openclawDir = path.resolve(ROOT_DIR, "..", "3rd-party-repos", "openclaw");

console.log(`Using ${path.relative(ROOT_DIR, envFile)} for OpenClaw TUI`);

const result = spawnSync(
  "pnpm",
  ["tui", "--", "--url", `ws://127.0.0.1:${port}`, "--token", token],
  {
    cwd: openclawDir,
    stdio: "inherit",
    env: {
      ...process.env,
      OPENCLAW_GATEWAY_PORT: port,
      OPENCLAW_GATEWAY_TOKEN: token,
    },
  },
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
