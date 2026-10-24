import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const cache: Record<string, string> = {};
let loaded = false;

function runtimeEnv(name: string): string | undefined {
  return process.env[name];
}

function parseEnvFile(text: string): void {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key || key.startsWith("NEXT_PUBLIC_")) continue;
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    if (value) cache[key] = value;
  }
}

function candidateFiles(): string[] {
  const out: string[] = [];
  const explicit = runtimeEnv("CROSSNEWS_ENV_FILE");
  if (explicit) out.push(explicit);
  const cwd = process.cwd();
  out.push(resolve(/* turbopackIgnore: true */ cwd, ".env.production"));
  out.push(resolve(/* turbopackIgnore: true */ cwd, ".env.local"));
  return out;
}

/** Server-only. Never import from client components. */
export function loadServerEnv(): void {
  if (loaded) return;
  loaded = true;
  if (typeof window !== "undefined") return;
  for (const path of candidateFiles()) {
    try {
      if (!existsSync(path)) continue;
      parseEnvFile(readFileSync(path, "utf8"));
    } catch {
      // ignore unreadable files
    }
  }
  for (const key of [
    "OLLAMA_HOST",
    "OLLAMA_MODEL",
    "OFFLINE_MODE",
    "OFFLINE_CUTOFF_ISO",
  ]) {
    const value = runtimeEnv(key)?.trim();
    if (value && !cache[key]) cache[key] = value;
  }
}

export function serverEnv(key: string): string | undefined {
  loadServerEnv();
  return cache[key] || undefined;
}

