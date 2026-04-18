import fs from "node:fs";
import path from "node:path";

const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DOCKER_ENV_PATH = path.join(ROOT_DIR, "docker", ".env");
const DOCKER_ENV_EXAMPLE_PATH = path.join(ROOT_DIR, "docker", ".env.example");

export function resolveDockerEnvFile() {
  if (fs.existsSync(DOCKER_ENV_PATH)) {
    return DOCKER_ENV_PATH;
  }
  if (fs.existsSync(DOCKER_ENV_EXAMPLE_PATH)) {
    return DOCKER_ENV_EXAMPLE_PATH;
  }
  throw new Error("Missing docker/.env and docker/.env.example");
}

export function readEnvFile(filePath) {
  const result = {};
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    result[key] = value;
  }
  return result;
}

export { ROOT_DIR };
