import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ArchiveMeta, FeedResponse } from "./types";
import { SCHEMA_VERSION, publicCrossing } from "./types";
import { serverEnv } from "./server-env";

/** Saturday 24 Oct 2026 12:00 America/Sao_Paulo. */
export const DEFAULT_CUTOFF_ISO = "2026-10-24T15:00:00.000Z";

const LEAK =
  /(?:192\.168\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|10\.\d+\.|172\.(?:1[6-9]|2\d|3[01])\.)|\b127\.0\.0\.1\b|:11434\b|:3013\b|OLLAMA_|gpu-server-01|mac-srv-01|tailscale/i;

let cachedSnapshot: FeedResponse | null = null;

export function cutoffIso(): string {
  return serverEnv("OFFLINE_CUTOFF_ISO")?.trim() || DEFAULT_CUTOFF_ISO;
}

export function snapshotPath(): string {
  return resolve(/* turbopackIgnore: true */ process.cwd(), "data/offline-snapshot.json");
}

export function lockPath(): string {
  return resolve(/* turbopackIgnore: true */ process.cwd(), "data/offline.lock");
}

export function isPastCutoff(now = Date.now()): boolean {
  const at = Date.parse(cutoffIso());
  return Number.isFinite(at) && now >= at;
}

export function isOfflineFlag(): boolean {
  const flag = serverEnv("OFFLINE_MODE")?.trim().toLowerCase();
  if (flag === "1" || flag === "true" || flag === "yes") return true;
  try {
    return existsSync(lockPath());
  } catch {
    return false;
  }
}

/** Stop outbound ingest / Ollama / refresh. */
export function shouldStopLiveCapture(now = Date.now()): boolean {
  return isOfflineFlag() || isPastCutoff(now);
}

export function archiveMeta(offline: boolean, snapshotAt: string | null = null): ArchiveMeta {
  return {
    offline,
    cutoffAt: cutoffIso(),
    snapshotAt,
  };
}

export function publicSourceText(value: string | null): string | null {
  if (!value) return value;
  return LEAK.test(value) ? "indisponível" : value;
}

export function sanitizePublicFeed(feed: FeedResponse): FeedResponse {
  return {
    ...feed,
    schemaVersion: feed.schemaVersion ?? SCHEMA_VERSION,
    crossing: publicCrossing({
      ...feed.crossing,
      guardrails: feed.crossing.guardrails?.includes("public-sanitize")
        ? feed.crossing.guardrails
        : [...(feed.crossing.guardrails ?? []), "public-sanitize"],
    }),
    sources: feed.sources.map((source) => ({
      ...source,
      lastError: publicSourceText(source.lastError),
      note: publicSourceText(source.note),
    })),
    banners: feed.banners.filter((banner) => !LEAK.test(banner)),
  };
}

export function loadOfflineSnapshot(): FeedResponse | null {
  if (cachedSnapshot) return cachedSnapshot;
  const path = snapshotPath();
  try {
    if (!existsSync(path)) return null;
    const raw = JSON.parse(readFileSync(path, "utf8")) as {
      snapshotAt?: string;
      cutoffAt?: string;
      feed?: FeedResponse;
    } & Partial<FeedResponse>;
    const feed = sanitizePublicFeed(
      (raw.feed && Array.isArray(raw.feed.clusters) ? raw.feed : raw) as FeedResponse,
    );
    const snapshotAt =
      raw.snapshotAt || feed.lastIngestAt || feed.generatedAt || new Date().toISOString();
    cachedSnapshot = {
      ...feed,
      archive: archiveMeta(true, snapshotAt),
    };
    return cachedSnapshot;
  } catch {
    return null;
  }
}
