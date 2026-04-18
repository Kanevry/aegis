#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
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

function runOrThrow(command, args, options) {
  const result = spawnSync(command, args, options);
  if (result.error) {
    throw result.error;
  }
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (!fs.existsSync(path.join(openclawDir, "node_modules"))) {
  console.log("OpenClaw dependencies are missing; running pnpm install first");
  runOrThrow("pnpm", ["install"], {
    cwd: openclawDir,
    stdio: "inherit",
    env: process.env,
  });
}

runOrThrow("pnpm", ["tui", "--", "--url", `ws://127.0.0.1:${port}`, "--token", token], {
  cwd: openclawDir,
  stdio: "inherit",
  env: {
    ...process.env,
    OPENCLAW_GATEWAY_PORT: port,
    OPENCLAW_GATEWAY_TOKEN: token,
  },
});
