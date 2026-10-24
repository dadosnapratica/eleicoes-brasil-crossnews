import type { FeedResponse } from "./types";
import { isUsableFeed, loadLastGood, persistLastGood } from "./last-good";

let snapshot: FeedResponse | null = null;

function hydrateFromDisk(): FeedResponse | null {
  const last = loadLastGood();
  if (!last) return null;
  snapshot = {
    ...last,
    generatedAt: new Date().toISOString(),
  };
  delete snapshot.archive;
  return snapshot;
}

export function getStore(): FeedResponse | null {
  if (snapshot) return snapshot;
  return hydrateFromDisk();
}

export function replaceStore(next: FeedResponse): void {
  if (!isUsableFeed(next) && isUsableFeed(snapshot)) {
    return;
  }
  snapshot = next;
  if (isUsableFeed(snapshot)) persistLastGood(snapshot);
}

export function patchStore(next: Partial<FeedResponse>): FeedResponse | null {
  if (!snapshot && !hydrateFromDisk()) return null;
  snapshot = { ...snapshot!, ...next };
  if (isUsableFeed(snapshot)) persistLastGood(snapshot);
  return snapshot;
}
