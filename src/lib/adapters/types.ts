import type { FeedItem, SourceStatus } from "../types";

export interface SourceAdapter {
  id: string;
  name: string;
  homepage: string;
  liveUrl?: string;
  priority: number;
  pollMs: number;
  fetchLatest(): Promise<AdapterResult>;
}

export interface AdapterResult {
  items: FeedItem[];
  status: Omit<
    SourceStatus,
    "mode" | "liveCount" | "newsCount" | "factcheckCount"
  > & {
    lastError: string | null;
    note: string | null;
  };
}
