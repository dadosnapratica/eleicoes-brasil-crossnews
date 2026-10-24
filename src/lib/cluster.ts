import type { ClaimCluster, Consensus, FeedItem, Verdict } from "./types";
import { hashId, similarClaims } from "./normalize";
import { isNegative, isPositive } from "./verdict";

function candidatesCompatible(
  a: FeedItem["candidate"],
  b: FeedItem["candidate"],
): boolean {
  if (a === "nenhum" || b === "nenhum") return true;
  if (a === "ambos" || b === "ambos") return true;
  return a === b;
}

function primaryCandidate(items: FeedItem[]): FeedItem["candidate"] {
  const counts = new Map<FeedItem["candidate"], number>();
  for (const item of items) {
    if (item.candidate === "nenhum" || item.candidate === "ambos") continue;
    counts.set(item.candidate, (counts.get(item.candidate) ?? 0) + 1);
  }
  let best: FeedItem["candidate"] = items[0]?.candidate ?? "nenhum";
  let max = 0;
  for (const [key, value] of counts) {
    if (value > max) {
      best = key;
      max = value;
    }
  }
  return best;
}

function bucket(verdict: Verdict | null): "fato" | "fake" | "meio" | "inconclusivo" {
  if (!verdict) return "inconclusivo";
  if (isPositive(verdict)) return "fato";
  if (isNegative(verdict)) return "fake";
  if (verdict === "inconclusivo") return "inconclusivo";
  return "meio";
}

function consensusOf(items: FeedItem[]): {
  consensus: Consensus;
  consensusScore: number;
  convergenceCount: number;
  divergenceCount: number;
} {
  const buckets = { fato: 0, fake: 0, meio: 0, inconclusivo: 0 };
  for (const item of items) {
    buckets[bucket(item.verdict)] += 1;
  }
  const total = items.length;
  const decisive = buckets.fato + buckets.fake;
  const largest = Math.max(buckets.fato, buckets.fake, buckets.meio, buckets.inconclusivo);
  const convergenceCount = largest;
  const divergenceCount = Math.max(0, total - largest);

  let consensus: Consensus = "inconclusivo";
  if (buckets.fato > 0 && buckets.fake > 0) {
    consensus = "divergente";
  } else if (buckets.fato > 0 && buckets.fato >= buckets.meio && buckets.fato >= buckets.inconclusivo) {
    consensus = "fato";
  } else if (buckets.fake > 0 && buckets.fake >= buckets.meio && buckets.fake >= buckets.inconclusivo) {
    consensus = "fake";
  } else if (
    buckets.meio > 0 &&
    buckets.meio >= buckets.inconclusivo &&
    buckets.fato === 0 &&
    buckets.fake === 0
  ) {
    // One desk (or several agreeing) said impreciso/exagerado/contexto.
    // Do not collapse to inconclusivo just because nobody else published.
    const hardCorrection = items.some(
      (item) => item.verdict === "impreciso" || item.verdict === "exagerado",
    );
    consensus = hardCorrection ? "fake" : "inconclusivo";
  } else if (divergenceCount > 0 && decisive === 0 && buckets.meio > 0 && buckets.inconclusivo > 0) {
    consensus = "inconclusivo";
  } else if (divergenceCount > 0 && largest < total) {
    consensus = buckets.fato || buckets.fake ? "divergente" : "inconclusivo";
  }

  const unity = total === 0 ? 0 : Math.round((convergenceCount / total) * 100);
  const splitPenalty = buckets.fato > 0 && buckets.fake > 0 ? 35 : 0;
  const consensusScore = Math.max(0, Math.min(100, unity - splitPenalty));

  return { consensus, consensusScore, convergenceCount, divergenceCount };
}

export function fingerprintFactChecks(items: FeedItem[]): string {
  return items
    .filter((item) => item.kind === "factcheck")
    .map((item) => item.id)
    .sort()
    .join("|");
}

export function clustersFromGroups(
  groups: FeedItem[][],
  extras?: { justification?: string; crossingEngine?: "ollama" | "heuristic" },
): ClaimCluster[] {
  return groups
    .filter((group) => group.length > 0)
    .map((group) => {
      const stats = consensusOf(group);
      const latestAt = group
        .map((item) => item.publishedAt)
        .sort()
        .at(-1) as string;
      const candidate = primaryCandidate(group);
      const topic =
        group.find((item) => item.topic && item.topic !== "politica")?.topic ??
        group[0].topic;
      const canonical =
        group.find((item) => item.claim.length >= 40)?.claim ?? group[0].claim;
      return {
        id: `cluster_${hashId([candidate, canonical])}`,
        canonicalClaim: canonical,
        candidate,
        topic,
        items: group.sort(
          (a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt),
        ),
        latestAt,
        justification: extras?.justification,
        crossingEngine: extras?.crossingEngine,
        ...stats,
      };
    })
    .sort((a, b) => {
      const sourcesA = new Set(a.items.map((item) => item.sourceId)).size;
      const sourcesB = new Set(b.items.map((item) => item.sourceId)).size;
      if (sourcesB !== sourcesA) return sourcesB - sourcesA;
      return +new Date(b.latestAt) - +new Date(a.latestAt);
    });
}

export function clusterFactChecks(items: FeedItem[]): ClaimCluster[] {
  const checks = items
    .filter((item) => item.kind === "factcheck" && item.claim.trim().length > 0)
    .sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt));

  const groups: FeedItem[][] = [];

  for (const item of checks) {
    let placed = false;
    for (const group of groups) {
      const seed = group[0];
      if (!candidatesCompatible(seed.candidate, item.candidate)) continue;
      const same =
        similarClaims(seed.claim, item.claim) ||
        similarClaims(seed.title, item.title) ||
        similarClaims(seed.claim, item.title);
      if (same) {
        group.push(item);
        placed = true;
        break;
      }
    }
    if (!placed) groups.push([item]);
  }

  return clustersFromGroups(groups, { crossingEngine: "heuristic" });
}
