#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { ROOT_DIR, resolveDockerEnvFile } from "./docker-openclaw-env.mjs";

function log(message) {
  process.stdout.write(`${message}\n`);
}

const envFile = resolveDockerEnvFile();
const relativeEnvFile = path.relative(ROOT_DIR, envFile) || envFile;

log(`Using ${relativeEnvFile} for OpenClaw Docker start`);

const result = spawnSync(
  "docker",
  [
    "compose",
    "-f",
    "docker/docker-compose.yml",
    "--env-file",
    relativeEnvFile,
    "up",
    "-d",
    "--build",
    "openclaw-gateway",
  ],
  {
    cwd: ROOT_DIR,
    stdio: "inherit",
  },
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
