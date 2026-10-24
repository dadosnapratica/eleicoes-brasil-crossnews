export type CandidateId = "flavio_bolsonaro" | "lula" | "ambos" | "nenhum";

export type ItemKind = "news" | "factcheck";

export type Verdict =
  | "verdadeiro"
  | "exagerado"
  | "impreciso"
  | "falso"
  | "insustentavel"
  | "contexto"
  | "inconclusivo";

export type Consensus = "fato" | "fake" | "divergente" | "inconclusivo";

export type SourceMode = "live" | "offline";

export type CrossingStatus = "pending" | "ready" | "fallback";
export type CrossingEngine = "ollama" | "heuristic";

/** Public FeedResponse / CrossingMeta shape. Bump when adding or removing fields. */
export const SCHEMA_VERSION = 1;

/** Safe model token only (name, not host/path/URL). */
export const PUBLIC_MODEL_RE = /^[a-z0-9][a-z0-9._:-]{1,47}$/i;

/** Safe prompt version token, e.g. `cross-v1`. */
export const PUBLIC_PROMPT_VERSION_RE = /^[a-z0-9][a-z0-9._-]{1,31}$/i;

/** Guardrail ids that may appear on the public crossing payload. */
export const PUBLIC_GUARDRAIL_IDS = [
  "json-only",
  "allowlist-enums",
  "no-unknown-ids",
  "no-invented-verdict",
  "heuristic-score",
  "force-divergente",
  "timeout-fallback",
  "public-sanitize",
] as const;

export type GuardrailId = (typeof PUBLIC_GUARDRAIL_IDS)[number];

export interface CrossingMeta {
  status: CrossingStatus;
  engine: CrossingEngine;
  model?: string;
  promptVersion?: string;
  signature?: string;
  schemaVersion?: number;
  updatedAt?: string;
  error?: string;
  guardrails?: string[];
}

/** Public crossing payload: never include host, IP, port or fetch URLs. */
export function publicCrossing(meta: CrossingMeta): CrossingMeta {
  const model =
    meta.model && PUBLIC_MODEL_RE.test(meta.model) ? meta.model : undefined;
  const promptVersion =
    meta.promptVersion && PUBLIC_PROMPT_VERSION_RE.test(meta.promptVersion)
      ? meta.promptVersion
      : undefined;
  const allowed = new Set<string>(PUBLIC_GUARDRAIL_IDS);
  const guardrails = Array.isArray(meta.guardrails)
    ? meta.guardrails.filter((id) => allowed.has(id)).slice(0, 16)
    : undefined;
  const out: CrossingMeta = {
    status: meta.status,
    engine: meta.engine,
    signature: meta.signature,
    schemaVersion:
      typeof meta.schemaVersion === "number" ? meta.schemaVersion : SCHEMA_VERSION,
    updatedAt: meta.updatedAt,
  };
  if (model) out.model = model;
  if (promptVersion) out.promptVersion = promptVersion;
  if (guardrails?.length) out.guardrails = guardrails;
  if (meta.status === "fallback") out.error = "indisponível";
  return out;
}

export interface FeedItem {
  id: string;
  kind: ItemKind;
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  title: string;
  claim: string;
  verdict: Verdict | null;
  originalVerdictLabel: string | null;
  summary: string;
  candidate: CandidateId;
  topic: string;
  publishedAt: string;
  fetchedAt: string;
}

export interface ClaimCluster {
  id: string;
  canonicalClaim: string;
  candidate: CandidateId;
  topic: string;
  items: FeedItem[];
  convergenceCount: number;
  divergenceCount: number;
  consensus: Consensus;
  consensusScore: number;
  latestAt: string;
  justification?: string;
  crossingEngine?: CrossingEngine;
}

export interface CandidateScore {
  candidate: Exclude<CandidateId, "ambos" | "nenhum">;
  name: string;
  checksTotal: number;
  verdadeiro: number;
  falso: number;
  outros: number;
  convergencias: number;
  divergencias: number;
  truthIndex: number;
  lieIndex: number;
}

export interface SourceStatus {
  id: string;
  name: string;
  homepage: string;
  liveUrl: string | null;
  priority: number;
  online: boolean;
  mode: SourceMode;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastFetchedAt: string | null;
  liveCount: number;
  newsCount: number;
  factcheckCount: number;
  note: string | null;
}

export interface ArchiveMeta {
  offline: boolean;
  cutoffAt: string;
  snapshotAt: string | null;
}

export interface FeedResponse {
  schemaVersion: number;
  generatedAt: string;
  lastIngestAt: string | null;
  debate: {
    outlet: string;
    title: string;
    candidates: string[];
    dateLabel: string;
  };
  clusters: ClaimCluster[];
  news: FeedItem[];
  scores: CandidateScore[];
  sources: SourceStatus[];
  counts: {
    news: number;
    factcheck: number;
    liveNews: number;
    liveFactcheck: number;
  };
  banners: string[];
  crossing: CrossingMeta;
  archive?: ArchiveMeta;
}

export const CANDIDATE_LABEL: Record<CandidateId, string> = {
  flavio_bolsonaro: "Flávio Bolsonaro",
  lula: "Lula",
  ambos: "Ambos",
  nenhum: "Não atribuído",
};

export const VERDICT_LABEL: Record<Verdict, string> = {
  verdadeiro: "Verdadeiro",
  exagerado: "Exagerado",
  impreciso: "Impreciso",
  falso: "Falso",
  insustentavel: "Insustentável",
  contexto: "Não é bem assim",
  inconclusivo: "Inconclusivo",
};

export const CONSENSUS_LABEL: Record<Consensus, string> = {
  fato: "FATO",
  fake: "FAKE",
  divergente: "DIVERGENTE",
  inconclusivo: "INCONCLUSIVO",
};
