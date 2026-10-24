import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { FeedResponse } from "./types";
import { sanitizePublicFeed } from "./offline";

let cached: FeedResponse | null | undefined;

export function lastGoodPath(): string {
  return resolve(/* turbopackIgnore: true */ process.cwd(), "data/last-good-feed.json");
}

/** Real prior capture only: clusters and/or live factchecks. Never invent items. */
export function isUsableFeed(feed: FeedResponse | null | undefined): boolean {
  if (!feed) return false;
  if (feed.clusters.length > 0) return true;
  if ((feed.counts?.liveFactcheck ?? 0) > 0) return true;
  if ((feed.counts?.factcheck ?? 0) > 0) return true;
  if (feed.scores.some((score) => score.checksTotal > 0)) return true;
  return false;
}

export function loadLastGood(): FeedResponse | null {
  if (cached !== undefined) return cached;
  cached = readLastGoodFromDisk();
  return cached;
}

function readLastGoodFromDisk(): FeedResponse | null {
  try {
    const path = lastGoodPath();
    if (!existsSync(path)) return null;
    const raw = JSON.parse(readFileSync(path, "utf8")) as {
      feed?: FeedResponse;
    } & Partial<FeedResponse>;
    const feed = (
      raw.feed && Array.isArray(raw.feed.clusters) ? raw.feed : raw
    ) as FeedResponse;
    if (!Array.isArray(feed.clusters) || !isUsableFeed(feed)) return null;
    return sanitizePublicFeed(feed);
  } catch {
    return null;
  }
}

export function persistLastGood(feed: FeedResponse): void {
  if (!isUsableFeed(feed)) return;
  try {
    const dest = lastGoodPath();
    mkdirSync(dirname(dest), { recursive: true });
    const tmp = `${dest}.${process.pid}.tmp`;
    const body = sanitizePublicFeed({ ...feed });
    delete body.archive;
    writeFileSync(tmp, JSON.stringify(body));
    renameSync(tmp, dest);
    cached = body;
  } catch {
    // Keep serving memory if disk write fails.
  }
}
