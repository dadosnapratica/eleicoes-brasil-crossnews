import type { CandidateScore, ClaimCluster, FeedItem } from "./types";
import { verdictWeight } from "./verdict";

const NAMES = {
  flavio_bolsonaro: "Flávio Bolsonaro",
  lula: "Lula",
} as const;

export function scoreCandidates(
  items: FeedItem[],
  clusters: ClaimCluster[],
): CandidateScore[] {
  return (["flavio_bolsonaro", "lula"] as const).map((candidate) => {
    const relevant = items.filter(
      (item) =>
        item.kind === "factcheck" &&
        item.verdict &&
        (item.candidate === candidate || item.candidate === "ambos"),
    );

    let verdadeiro = 0;
    let falso = 0;
    let outros = 0;
    let weightSum = 0;
    let weightN = 0;

    for (const item of relevant) {
      if (!item.verdict) continue;
      if (item.verdict === "verdadeiro") verdadeiro += 1;
      else if (item.verdict === "falso" || item.verdict === "insustentavel") {
        falso += 1;
      } else {
        outros += 1;
      }
      const w = verdictWeight(item.verdict);
      if (w !== null) {
        weightSum += w;
        weightN += 1;
      }
    }

    const relatedClusters = clusters.filter(
      (cluster) =>
        cluster.candidate === candidate || cluster.candidate === "ambos",
    );
    const convergencias = relatedClusters.reduce(
      (acc, cluster) => acc + cluster.convergenceCount,
      0,
    );
    const divergencias = relatedClusters.reduce(
      (acc, cluster) => acc + cluster.divergenceCount,
      0,
    );

    const truthIndex =
      weightN === 0 ? 0 : Math.round((weightSum / weightN) * 100);
    const lieIndex = weightN === 0 ? 0 : 100 - truthIndex;

    return {
      candidate,
      name: NAMES[candidate],
      checksTotal: relevant.length,
      verdadeiro,
      falso,
      outros,
      convergencias,
      divergencias,
      truthIndex,
      lieIndex,
    };
  });
}
