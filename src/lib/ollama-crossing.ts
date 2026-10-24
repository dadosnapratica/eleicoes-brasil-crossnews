import type { ClaimCluster, CrossingMeta, FeedItem, GuardrailId } from "./types";
import {
  CROSSING_TIMEOUT_MS,
  COMPACT_CLAIM_MAX,
  PROMPT_VERSION,
  buildUserPrompt,
  crossingAudit,
  guardForceDivergente,
  guardHeuristicScore,
  guardKnownItemIds,
  guardNoInventedVerdict,
  ollamaChatBody,
  parseModelGroups,
  type ModelGroup,
} from "./ai-governance";
import { clusterFactChecks, clustersFromGroups, fingerprintFactChecks } from "./cluster";
import { sameNumericClaim, similarClaims } from "./normalize";
import { serverEnv } from "./server-env";
import { execFile } from "node:child_process";

function internalRequestReachable(
  url: string,
  init: { method?: string; body?: string; timeoutMs: number },
): Promise<{ ok: boolean; text: string }> {
  return new Promise((resolve, reject) => {
    const args = [
      "-sS",
      "-o",
      "-",
      "-w",
      "\n%{http_code}",
      "--max-time",
      String(Math.max(2, Math.ceil(init.timeoutMs / 1000))),
    ];
    if (init.body) {
      args.push("-X", "POST", "-H", "Content-Type: application/json", "--data-binary", init.body);
    }
    args.push(url);
    execFile(
      "/usr/bin/curl",
      args,
      { timeout: init.timeoutMs + 1000, maxBuffer: 8_000_000 },
      (error, stdout) => {
        if (error && !stdout) {
          reject(error);
          return;
        }
        const split = stdout.lastIndexOf("\n");
        const text = split >= 0 ? stdout.slice(0, split) : stdout;
        const code = Number((split >= 0 ? stdout.slice(split + 1) : "").trim());
        resolve({ ok: code >= 200 && code < 300, text });
      },
    );
  });
}

export function ollamaConfig(): { host: string; model: string } | null {
  const raw = serverEnv("OLLAMA_HOST")?.trim();
  const model = serverEnv("OLLAMA_MODEL")?.trim();
  if (!raw || !model) return null;
  const host = raw.startsWith("http") ? raw.replace(/\/$/, "") : `http://${raw}`;
  return { host, model };
}

export async function ollamaReady(): Promise<boolean> {
  const cfg = ollamaConfig();
  if (!cfg) return false;
  try {
    const res = await internalRequestReachable(`${cfg.host}/api/tags`, {
      timeoutMs: 4000,
    });
    return res.ok;
  } catch {
    return false;
  }
}

function compactItems(items: FeedItem[]) {
  return items
    .filter((item) => item.kind === "factcheck")
    .map((item) => ({
      id: item.id,
      mesa: item.sourceName,
      candidato: item.candidate,
      selo: item.originalVerdictLabel ?? item.verdict,
      veredito: item.verdict,
      afirmação: (item.claim || item.title).slice(0, COMPACT_CLAIM_MAX),
    }));
}

async function chatJson(prompt: string): Promise<string> {
  const cfg = ollamaConfig();
  if (!cfg) throw new Error("indisponível");
  const { host, model } = cfg;
  const res = await internalRequestReachable(`${host}/api/chat`, {
    method: "POST",
    timeoutMs: CROSSING_TIMEOUT_MS,
    body: ollamaChatBody(model, prompt),
  });
  if (!res.ok) {
    throw new Error("indisponível");
  }
  const data = JSON.parse(res.text) as { message?: { content?: string } };
  return data.message?.content ?? "";
}

function applyGroups(
  items: FeedItem[],
  groups: ModelGroup[],
): ClaimCluster[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const used = new Set<string>();
  const built: ClaimCluster[] = [];

  for (const group of groups) {
    // no-unknown-ids: ignore ids the model invented.
    const members = guardNoInventedVerdict(
      guardKnownItemIds(group.itemIds, byId),
    );
    if (members.length === 0) continue;
    const [cluster] = clustersFromGroups([members], {
      justification: group.justification,
      crossingEngine: "ollama",
    });
    if (!cluster) continue;
    for (const item of members) used.add(item.id);
    if (group.canonicalClaim.length >= 24) {
      cluster.canonicalClaim = group.canonicalClaim;
    }
    if (group.candidate !== "nenhum") cluster.candidate = group.candidate;
    // Model may label the group; item.verdict is never written here.
    cluster.consensus = group.consensus;
    cluster.justification = group.justification;
    cluster.crossingEngine = "ollama";
    // heuristic-score: placar numérico volta a ser das mesas, não do modelo.
    guardHeuristicScore(cluster, { justification: group.justification });
    // force-divergente: verdadeiro + selo negativo não pode ficar FATO.
    guardForceDivergente(cluster);
    built.push(cluster);
  }

  const leftovers = items.filter(
    (item) => item.kind === "factcheck" && !used.has(item.id),
  );
  const still: FeedItem[] = [];
  for (const item of leftovers) {
    const host = built.find((cluster) => {
      const blob = `${cluster.canonicalClaim} ${cluster.items.map((entry) => entry.claim).join(" ")}`;
      const probe = `${item.claim} ${item.title}`;
      return (
        similarClaims(blob, probe) ||
        sameNumericClaim(blob, probe)
      );
    });
    if (host) {
      host.items.push(item);
      used.add(item.id);
    } else {
      still.push(item);
    }
  }
  for (const cluster of built) {
    guardHeuristicScore(cluster, { justification: cluster.justification });
    guardForceDivergente(cluster);
  }
  if (still.length) {
    built.push(
      ...clusterFactChecks(still).map((cluster) => ({
        ...cluster,
        crossingEngine: "heuristic" as const,
      })),
    );
  }

  return built.sort((a, b) => {
    const sourcesA = new Set(a.items.map((item) => item.sourceId)).size;
    const sourcesB = new Set(b.items.map((item) => item.sourceId)).size;
    if (sourcesB !== sourcesA) return sourcesB - sourcesA;
    return +new Date(b.latestAt) - +new Date(a.latestAt);
  });
}

export async function refineClustersWithOllama(
  items: FeedItem[],
): Promise<{ clusters: ClaimCluster[]; meta: CrossingMeta }> {
  const cfg = ollamaConfig();
  const signature = fingerprintFactChecks(items);
  const checks = items.filter((item) => item.kind === "factcheck");
  const fallback = (
    guardrails: readonly GuardrailId[] = ["timeout-fallback"],
  ): CrossingMeta =>
    crossingAudit({
      status: "fallback",
      engine: "heuristic",
      signature,
      error: "indisponível",
      guardrails,
    });

  if (checks.length === 0) {
    return {
      clusters: [],
      meta: { ...fallback([]), status: "ready", engine: "heuristic" },
    };
  }
  if (!cfg || !(await ollamaReady())) {
    return {
      clusters: clusterFactChecks(items),
      meta: fallback(["timeout-fallback"]),
    };
  }

  const batches: FeedItem[][] = [];
  const byCandidate = new Map<string, FeedItem[]>();
  for (const item of checks) {
    const key = item.candidate === "ambos" ? "lula" : item.candidate;
    const list = byCandidate.get(key) ?? [];
    list.push(item);
    byCandidate.set(key, list);
  }
  for (const list of byCandidate.values()) {
    for (let i = 0; i < list.length; i += 12) {
      batches.push(list.slice(i, i + 12));
    }
  }

  try {
    const groups: ModelGroup[] = [];
    const concurrency = 2;
    for (let i = 0; i < batches.length; i += concurrency) {
      const slice = batches.slice(i, i + concurrency);
      const parsed = await Promise.all(
        slice.map(async (batch) => {
          try {
            const raw = await chatJson(
              buildUserPrompt(JSON.stringify(compactItems(batch))),
            );
            return parseModelGroups(raw) ?? [];
          } catch {
            return [];
          }
        }),
      );
      for (const group of parsed) groups.push(...group);
    }
    if (groups.length === 0) {
      return {
        clusters: clusterFactChecks(items),
        meta: fallback(["json-only", "timeout-fallback"]),
      };
    }
    return {
      clusters: applyGroups(checks, groups),
      meta: crossingAudit({
        status: "ready",
        engine: "ollama",
        model: cfg.model,
        signature,
        guardrails: [
          "json-only",
          "allowlist-enums",
          "no-unknown-ids",
          "no-invented-verdict",
          "heuristic-score",
          "force-divergente",
        ],
      }),
    };
  } catch {
    return {
      clusters: clusterFactChecks(items),
      meta: fallback(["timeout-fallback"]),
    };
  }
}

export { PROMPT_VERSION };
