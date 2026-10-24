import type { FeedItem, FeedResponse, SourceMode, SourceStatus } from "./types";
import { SCHEMA_VERSION } from "./types";
import { PROMPT_VERSION } from "./ai-governance";
import { adapters } from "./adapters";
import type { AdapterResult } from "./adapters/types";
import { clusterFactChecks, fingerprintFactChecks } from "./cluster";
import { scoreCandidates } from "./score";
import { isDebateNightStamp, isDebateScoped, isLiveblogUrl } from "./normalize";
import { getStore, patchStore, replaceStore } from "./store";
import { isUsableFeed } from "./last-good";
import { refineClustersWithOllama } from "./ollama-crossing";
import {
  archiveMeta,
  loadOfflineSnapshot,
  sanitizePublicFeed,
  shouldStopLiveCapture,
} from "./offline";

const INGEST_MS = 30_000;

let loopStarted = false;
let ingesting = false;

function collectLive(liveBySource: Map<string, FeedItem[]>): FeedItem[] {
  const out: FeedItem[] = [];
  const seen = new Set<string>();
  for (const adapter of adapters) {
    const live = liveBySource.get(adapter.id) ?? [];
    for (const item of live) {
      const blob = `${item.title} ${item.claim} ${item.summary} ${item.sourceUrl}`;
      if (item.title.trim().length < 20) continue;
      if (item.topic === "metodologia") continue;
      const fromLiveblog = isLiveblogUrl(item.sourceUrl);
      if (fromLiveblog) {
        if (item.kind !== "factcheck") continue;
      } else if (!isDebateScoped(blob)) {
        continue;
      } else if (
        item.publishedAt &&
        item.publishedAt !== item.fetchedAt &&
        !isDebateNightStamp(item.publishedAt)
      ) {
        continue;
      }
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}

function finalizeStatuses(
  raw: AdapterResult[],
  items: FeedItem[],
): SourceStatus[] {
  return raw.map((result) => {
    const ofSource = items.filter((item) => item.sourceId === result.status.id);
    const liveCount = ofSource.length;
    const mode: SourceMode = result.status.online ? "live" : "offline";
    return {
      ...result.status,
      mode,
      liveCount,
      newsCount: ofSource.filter((item) => item.kind === "news").length,
      factcheckCount: ofSource.filter((item) => item.kind === "factcheck").length,
    };
  });
}

function emptyFeed(partial?: Partial<FeedResponse>): FeedResponse {
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    lastIngestAt: null,
    debate: {
      outlet: "Rede Globo",
      title: "Debate presidencial de 2º turno",
      candidates: ["Flávio Bolsonaro (PL)", "Lula (PT)"],
      dateLabel: "23 de outubro de 2026",
    },
    clusters: [],
    news: [],
    scores: scoreCandidates([], []),
    sources: [],
    counts: {
      news: 0,
      factcheck: 0,
      liveNews: 0,
      liveFactcheck: 0,
    },
    banners: [],
    crossing: {
      status: "pending",
      engine: "heuristic",
      promptVersion: PROMPT_VERSION,
      schemaVersion: SCHEMA_VERSION,
    },
    ...partial,
  };
}

export async function runIngest(): Promise<void> {
  if (shouldStopLiveCapture()) return;
  if (ingesting) return;
  ingesting = true;
  try {
    const results = await Promise.all(
      adapters.map(async (adapter) => {
        try {
          return await adapter.fetchLatest();
        } catch (error) {
          const message = error instanceof Error ? error.message : "erro";
          return {
            items: [] as FeedItem[],
            status: {
              id: adapter.id,
              name: adapter.name,
              homepage: adapter.homepage,
              liveUrl: adapter.liveUrl ?? null,
              priority: adapter.priority,
              online: false,
              lastSuccessAt: null,
              lastError: message,
              lastFetchedAt: new Date().toISOString(),
              note: null,
            },
          } satisfies AdapterResult;
        }
      }),
    );

    const liveBySource = new Map<string, FeedItem[]>();
    for (const result of results) {
      liveBySource.set(result.status.id, result.items);
    }

    const items = collectLive(liveBySource);
    const sources = finalizeStatuses(results, items);
    const signature = fingerprintFactChecks(items);
    const previous = getStore();
    const sameSignature = Boolean(
      previous && previous.crossing.signature === signature,
    );
    const reuseCrossing = Boolean(
      previous &&
        sameSignature &&
        previous.crossing.status === "ready" &&
        previous.crossing.engine === "ollama",
    );
    const crossingInFlight = Boolean(
      previous && sameSignature && previous.crossing.status === "pending",
    );
    const keepFallback = Boolean(
      previous && sameSignature && previous.crossing.status === "fallback",
    );
    const clusters =
      reuseCrossing && previous ? previous.clusters : clusterFactChecks(items);
    const scores =
      reuseCrossing && previous
        ? previous.scores
        : scoreCandidates(items, clusters);
    const news = items
      .filter((item) => item.kind === "news")
      .sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt));
    const liveFactcheck = items.filter((item) => item.kind === "factcheck").length;

    const banners: string[] = [];
    if (liveFactcheck === 0) {
      banners.push(
        "Aguardando checagens ao vivo. As mesas ainda não publicaram vereditos cruzáveis desta noite.",
      );
    }

    const nextFeed = emptyFeed({
      generatedAt: new Date().toISOString(),
      lastIngestAt: new Date().toISOString(),
      clusters,
      news,
      scores,
      sources,
      counts: {
        news: news.length,
        factcheck: liveFactcheck,
        liveNews: news.length,
        liveFactcheck,
      },
      banners,
      crossing:
        previous && (reuseCrossing || crossingInFlight || keepFallback)
          ? previous.crossing
          : {
              status: "pending",
              engine: "heuristic",
              signature,
              promptVersion: PROMPT_VERSION,
              schemaVersion: SCHEMA_VERSION,
            },
    });

    const keepPrevious =
      !isUsableFeed(nextFeed) &&
      isUsableFeed(previous) &&
      !shouldStopLiveCapture();
    if (keepPrevious) {
      patchStore({
        generatedAt: new Date().toISOString(),
        sources,
      });
    } else {
      replaceStore(nextFeed);
    }

    if (!keepPrevious) {
      if (crossingBusy && !sameSignature) {
        crossingQueued = { items, signature };
      } else if (!reuseCrossing && !crossingInFlight && !keepFallback && !crossingBusy) {
        scheduleCrossing(items, signature);
      }
    }
  } finally {
    ingesting = false;
  }
}

export function ensureIngestLoop(): void {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (shouldStopLiveCapture() || loopStarted) return;
  loopStarted = true;
  void runIngest();
  const timer = setInterval(() => {
    if (shouldStopLiveCapture()) return;
    void runIngest();
  }, INGEST_MS);
  if (typeof timer === "object" && "unref" in timer) {
    timer.unref();
  }
}

let crossingBusy = false;
let crossingQueued: { items: FeedItem[]; signature: string } | null = null;

export function scheduleCrossing(items: FeedItem[], signature: string): void {
  if (shouldStopLiveCapture()) return;
  if (crossingBusy) {
    crossingQueued = { items, signature };
    return;
  }
  crossingBusy = true;
  crossingQueued = null;
  void refineClustersWithOllama(items)
    .then(({ clusters, meta }) => {
      const checks = items.filter((item) => item.kind === "factcheck");
      patchStore({
        clusters,
        scores: scoreCandidates(checks, clusters),
        crossing: { ...meta, signature },
      });
    })
    .catch(() => {
      patchStore({
        crossing: {
          status: "fallback",
          engine: "heuristic",
          signature,
          promptVersion: PROMPT_VERSION,
          schemaVersion: SCHEMA_VERSION,
          updatedAt: new Date().toISOString(),
          error: "falha no cruzamento",
          guardrails: ["timeout-fallback"],
        },
      });
    })
    .finally(() => {
      crossingBusy = false;
      const next = crossingQueued;
      crossingQueued = null;
      if (next) scheduleCrossing(next.items, next.signature);
    });
}

export function requestCrossing(): FeedResponse {
  if (shouldStopLiveCapture()) return getFeed();
  const feed = getFeed();
  const items = feed.clusters.flatMap((cluster) => cluster.items);
  const unique = new Map(items.map((item) => [item.id, item]));
  const list = [...unique.values()];
  const signature = fingerprintFactChecks(list);
  const current = getStore();
  if (
    current &&
    current.crossing.signature === signature &&
    (current.crossing.status === "pending" || current.crossing.status === "ready")
  ) {
    return getFeed();
  }
  patchStore({
    crossing: {
      status: "pending",
      engine: "heuristic",
      signature,
      promptVersion: PROMPT_VERSION,
      schemaVersion: SCHEMA_VERSION,
    },
  });
  scheduleCrossing(list, signature);
  return getFeed();
}

export function getFeed(): FeedResponse {
  if (shouldStopLiveCapture()) {
    const snap = loadOfflineSnapshot();
    if (snap) return snap;
    const frozen = getStore();
    if (frozen) {
      return {
        ...sanitizePublicFeed(frozen),
        archive: archiveMeta(true, frozen.lastIngestAt ?? frozen.generatedAt),
      };
    }
    return {
      ...emptyFeed({
        banners: [
          "Captura em tempo real encerrada. Arquivo das últimas estatísticas ao vivo.",
        ],
      }),
      archive: archiveMeta(true, null),
    };
  }
  ensureIngestLoop();
  const feed = getStore();
  if (feed) {
    return {
      ...sanitizePublicFeed(feed),
      generatedAt: new Date().toISOString(),
      archive: archiveMeta(false),
    };
  }
  return {
    ...emptyFeed({
      banners: ["Coletando as mesas ao vivo…"],
    }),
    archive: archiveMeta(false),
  };
}
