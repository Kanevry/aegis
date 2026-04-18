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

function run(command, args, options) {
  const result = spawnSync(command, args, options);
  if (result.error) {
    throw result.error;
  }
  return result;
}

const tuiArgs = ["--url", `ws://127.0.0.1:${port}`, "--token", token];
const tuiEnv = {
  ...process.env,
  OPENCLAW_GATEWAY_PORT: port,
  OPENCLAW_GATEWAY_TOKEN: token,
};

if (!fs.existsSync(path.join(openclawDir, "node_modules"))) {
  console.log("OpenClaw dependencies are missing; running pnpm install first");
  runOrThrow("pnpm", ["install"], {
    cwd: openclawDir,
    stdio: "inherit",
    env: process.env,
  });
}

const localResult = run("pnpm", ["tui", "--", ...tuiArgs], {
  cwd: openclawDir,
  stdio: "inherit",
  env: tuiEnv,
});

if ((localResult.status ?? 1) === 0) {
  process.exit(0);
}

console.log("Local OpenClaw source TUI failed; falling back to published openclaw CLI");

runOrThrow("npx", ["--yes", "openclaw@latest", "tui", ...tuiArgs], {
  cwd: ROOT_DIR,
  stdio: "inherit",
  env: tuiEnv,
});
