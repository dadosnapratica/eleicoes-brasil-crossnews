import type {
  CandidateId,
  ClaimCluster,
  Consensus,
  CrossingEngine,
  CrossingMeta,
  CrossingStatus,
  FeedItem,
  GuardrailId,
} from "./types";
import { PUBLIC_MODEL_RE, SCHEMA_VERSION } from "./types";
import { clustersFromGroups } from "./cluster";
import { isPositive } from "./verdict";

/**
 * Prompt / crossing contract version. Bump this whenever SYSTEM_PROMPT,
 * buildUserPrompt, temperature, num_predict or timeout change.
 */
export const PROMPT_VERSION = "cross-v1";

export { SCHEMA_VERSION };

export const CROSSING_TIMEOUT_MS = 45_000;
export const CROSSING_TEMPERATURE = 0.1;
export const CROSSING_NUM_PREDICT = 900;
export const JUSTIFICATION_MAX = 280;
export const COMPACT_CLAIM_MAX = 220;

export const SYSTEM_PROMPT =
  "Você é um editor de mesa de checagem não-partidário. Só agrupa e compara o que as mesas já publicaram. Não invente veredito, número nem fonte. Responda só JSON.";

export const CONSENSUS_ALLOWLIST: Consensus[] = [
  "fato",
  "fake",
  "divergente",
  "inconclusivo",
];

export const CANDIDATE_ALLOWLIST: CandidateId[] = [
  "flavio_bolsonaro",
  "lula",
  "ambos",
  "nenhum",
];

export interface ModelGroup {
  itemIds: string[];
  canonicalClaim: string;
  candidate: CandidateId;
  consensus: Consensus;
  justification: string;
}

/** Production user prompt. Items JSON is already compacted by the caller. */
export function buildUserPrompt(itemsJson: string): string {
  return `Agrupe checagens que são A MESMA afirmação do candidato no debate da Globo (2º turno, Flávio Bolsonaro x Lula), mesmo com redação diferente. Não junte afirmações distintas.
Equivalências: "6 mil"="6.000"="seis mil"; "11.500"="onze mil e quinhentas"; "obras paradas"="obras paralisadas". Sem número em comum, não agrupe.
Itens: ${itemsJson}
Consenso: fato=só verdadeiro/#FATO; fake=falso/enganoso/impreciso/exagerado/subestimado sem verdadeiro contrário; divergente=verdadeiro e selo negativo; inconclusivo=só contexto.
Justificativa: uma frase pt-BR citando as mesas.
JSON: {"groups":[{"itemIds":["id"],"canonicalClaim":"...","candidate":"lula|flavio_bolsonaro|ambos|nenhum","consensus":"fato|fake|divergente|inconclusivo","justification":"..."}]}`;
}

export function ollamaChatBody(model: string, userPrompt: string): string {
  return JSON.stringify({
    model,
    stream: false,
    format: "json",
    options: {
      temperature: CROSSING_TEMPERATURE,
      num_predict: CROSSING_NUM_PREDICT,
    },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
  });
}

/** json-only — reject anything that is not an object with a groups array. */
export function guardJsonOnly(raw: string): unknown[] | null {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1)) as {
      groups?: unknown;
    };
    return Array.isArray(parsed.groups) ? parsed.groups : null;
  } catch {
    return null;
  }
}

/** allowlist-enums — consensus / candidate enums + justification length. */
export function guardAllowlistGroup(value: unknown): ModelGroup | null {
  if (!value || typeof value !== "object") return null;
  const group = value as Partial<ModelGroup>;
  const itemIds = Array.isArray(group.itemIds)
    ? group.itemIds.map(String)
    : [];
  if (itemIds.length === 0) return null;
  return {
    itemIds,
    canonicalClaim: String(group.canonicalClaim ?? "").trim(),
    candidate: CANDIDATE_ALLOWLIST.includes(group.candidate as CandidateId)
      ? (group.candidate as CandidateId)
      : "nenhum",
    consensus: CONSENSUS_ALLOWLIST.includes(group.consensus as Consensus)
      ? (group.consensus as Consensus)
      : "inconclusivo",
    justification: String(group.justification ?? "")
      .trim()
      .slice(0, JUSTIFICATION_MAX),
  };
}

export function parseModelGroups(raw: string): ModelGroup[] | null {
  const groups = guardJsonOnly(raw);
  if (!groups) return null;
  return groups
    .map(guardAllowlistGroup)
    .filter((group): group is ModelGroup => group !== null);
}

/** no-unknown-ids — drop itemIds the model invented. */
export function guardKnownItemIds(
  itemIds: string[],
  byId: Map<string, FeedItem>,
): FeedItem[] {
  const seen = new Set<string>();
  const members: FeedItem[] = [];
  for (const id of itemIds) {
    const item = byId.get(id);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    members.push(item);
  }
  return members;
}

/**
 * no-invented-verdict — the model never writes FeedItem.verdict.
 * Members keep the desk seal; this function is the documented no-op check.
 */
export function guardNoInventedVerdict(items: FeedItem[]): FeedItem[] {
  return items;
}

/**
 * heuristic-score — recalc convergence / score from desk seals.
 * The model may suggest a consensus label; the numeric placar is ours.
 */
export function guardHeuristicScore(
  cluster: ClaimCluster,
  extras?: { justification?: string },
): ClaimCluster {
  const [fresh] = clustersFromGroups([cluster.items], {
    justification: extras?.justification ?? cluster.justification,
    crossingEngine: cluster.crossingEngine,
  });
  if (!fresh) return cluster;
  cluster.convergenceCount = fresh.convergenceCount;
  cluster.divergenceCount = fresh.divergenceCount;
  cluster.consensusScore = fresh.consensusScore;
  cluster.latestAt = fresh.latestAt;
  return cluster;
}

/**
 * force-divergente — verdadeiro + a negative/correction seal cannot stay FATO.
 * Matches the production rule already applied after grouping.
 */
export function guardForceDivergente(cluster: ClaimCluster): ClaimCluster {
  const hasTrue = cluster.items.some(
    (item) => item.verdict && isPositive(item.verdict),
  );
  const hasNegativeSeal = cluster.items.some(
    (item) =>
      item.verdict &&
      item.verdict !== "verdadeiro" &&
      item.verdict !== "inconclusivo",
  );
  if (hasTrue && hasNegativeSeal) {
    cluster.consensus = "divergente";
  }
  return cluster;
}

export function safeModelName(model?: string): string | undefined {
  return model && PUBLIC_MODEL_RE.test(model) ? model : undefined;
}

export function crossingAudit(partial: {
  status: CrossingStatus;
  engine: CrossingEngine;
  model?: string;
  signature?: string;
  error?: string;
  guardrails: readonly GuardrailId[];
}): CrossingMeta {
  return {
    status: partial.status,
    engine: partial.engine,
    model: safeModelName(partial.model),
    promptVersion: PROMPT_VERSION,
    signature: partial.signature,
    schemaVersion: SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    error: partial.error,
    guardrails: [...partial.guardrails],
  };
}
