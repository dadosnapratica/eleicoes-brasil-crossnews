"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CandidateScore,
  ClaimCluster,
  CrossingMeta,
  FeedItem,
  FeedResponse,
  SourceStatus,
} from "@/lib/types";
import { candidateLabel, formatClock, formatRelative } from "@/lib/format";
import { ConsensusBadge, VerdictChip } from "./VerdictChip";
import { CandidatePhoto } from "./CandidatePhoto";
import { OfflineModal } from "./OfflineModal";
import {
  TSE_DADOS_ABERTOS,
  TSE_DIVULGA_BR,
  TSE_DIVULGA_HOME,
} from "@/lib/candidates";

const PRIMARY_SOURCES = [
  { id: "g1_fato_ou_fake", short: "G1" },
  { id: "uol_confere", short: "UOL Confere" },
  { id: "terra_aos_fatos", short: "Terra / Aos Fatos" },
  { id: "folha_lupa", short: "Folha / Lupa" },
  { id: "estadao_verifica", short: "Estadão Verifica" },
  { id: "afp_chegamos", short: "AFP Chegamos" },
  { id: "comprova", short: "Projeto Comprova" },
] as const;

const EMPTY: FeedResponse = {
  schemaVersion: 1,
  generatedAt: "",
  lastIngestAt: null,
  debate: {
    outlet: "Rede Globo",
    title: "Debate presidencial de 2º turno",
    candidates: ["Flávio Bolsonaro (PL)", "Lula (PT)"],
    dateLabel: "23 de outubro de 2026",
  },
  clusters: [],
  news: [],
  scores: [],
  sources: [],
  counts: { news: 0, factcheck: 0, liveNews: 0, liveFactcheck: 0 },
  banners: [],
  crossing: { status: "pending", engine: "heuristic" },
};

function hasPaintedData(feed: FeedResponse): boolean {
  return (
    feed.clusters.length > 0 ||
    feed.scores.some((score) => score.checksTotal > 0 || score.truthIndex > 0)
  );
}

function isZeroedLivePayload(feed: FeedResponse): boolean {
  if (feed.archive?.offline) return false;
  const noClusters = feed.clusters.length === 0;
  const noFacts =
    (feed.counts?.liveFactcheck ?? 0) === 0 && (feed.counts?.factcheck ?? 0) === 0;
  const scoresDead = feed.scores.every(
    (score) => score.checksTotal === 0 && score.truthIndex === 0 && score.lieIndex === 0,
  );
  return noClusters && noFacts && scoresDead;
}

export function Dashboard({ initialFeed }: { initialFeed?: FeedResponse }) {
  const [feed, setFeed] = useState<FeedResponse>(() =>
    initialFeed && hasPaintedData(initialFeed) ? initialFeed : EMPTY,
  );
  const [filter, setFilter] = useState("todos");
  const [sourceFilter, setSourceFilter] = useState("todas");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!hasPaintedData(feed));

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/feed", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const next = (await res.json()) as FeedResponse;
      setFeed((prev) => {
        if (hasPaintedData(prev) && isZeroedLivePayload(next)) return prev;
        return next;
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar o feed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (feed.archive?.offline) return;
    const timer = setInterval(() => void load(), 10_000);
    return () => clearInterval(timer);
  }, [load, feed.archive?.offline]);

  const clusters = useMemo(() => {
    return feed.clusters.filter((cluster) => {
      if (
        filter === "flavio" &&
        cluster.candidate !== "flavio_bolsonaro" &&
        cluster.candidate !== "ambos"
      ) {
        return false;
      }
      if (
        filter === "lula" &&
        cluster.candidate !== "lula" &&
        cluster.candidate !== "ambos"
      ) {
        return false;
      }
      if (filter === "fato" && cluster.consensus !== "fato") return false;
      if (filter === "fake" && cluster.consensus !== "fake") return false;
      if (filter === "divergente" && cluster.consensus !== "divergente") {
        return false;
      }
      if (sourceFilter !== "todas") {
        return cluster.items.some((item) => item.sourceId === sourceFilter);
      }
      return true;
    });
  }, [feed.clusters, filter, sourceFilter]);

  return (
    <div className="relative mx-auto min-h-screen max-w-[1400px] px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      <div className="orb-stars pointer-events-none absolute inset-x-0 top-0 h-64" />
      <Header feed={feed} onRefresh={() => void load()} />

      {feed.banners.map((banner) => (
        <p
          key={banner}
          className="mt-4 rounded-xl border border-[var(--navy)]/15 bg-white px-4 py-3 text-sm text-[var(--navy)]"
        >
          {banner}
        </p>
      ))}

      {error && (
        <p className="mt-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Não foi possível atualizar agora ({error}).
        </p>
      )}

      <FilterBar
        filter={filter}
        onFilter={setFilter}
        sourceFilter={sourceFilter}
        onSource={setSourceFilter}
        sources={feed.sources}
      />

      <CandidateMeters scores={feed.scores} />

      {loading && feed.clusters.length === 0 ? (
        <EmptyState
          title={
            feed.archive?.offline
              ? "Carregando o arquivo das últimas estatísticas…"
              : "Coletando declarações nas mesas ao vivo…"
          }
        />
      ) : clusters.length === 0 ? (
        <EmptyState
          title={
            feed.archive?.offline
              ? "Arquivo das últimas checagens gravadas ao vivo."
              : "Aguardando checagens ao vivo das mesas."
          }
        />
      ) : (
        <div className="mt-6 grid gap-4">
          {clusters.map((cluster, index) => (
            <ClaimCard key={cluster.id} cluster={cluster} index={index} />
          ))}
        </div>
      )}

      <SourcesStrip sources={feed.sources} />
      <MethodologyFooter />
      <OfflineModal archive={feed.archive} />
    </div>
  );
}

function Header({
  feed,
  onRefresh,
}: {
  feed: FeedResponse;
  onRefresh: () => void;
}) {
  return (
    <header className="relative flex flex-col gap-4 border-b border-[var(--line)] pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--navy)]">
          Eleições Brasil 2026 · jornalismo cívico
        </p>
        <h1
          className="mt-1 text-4xl font-semibold tracking-tight text-[var(--navy)] sm:text-6xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          CrossNews
        </h1>
        <p className="mt-1 text-base text-[var(--navy-mid)] sm:text-lg">
          Eleições Brasil · Debate Presidencial Globo
        </p>
        <p className="mt-2 max-w-3xl text-sm text-[var(--muted)] sm:text-base">
          {feed.debate.outlet} · {feed.debate.title} · {feed.debate.dateLabel}.
          Só declarações checadas pelas mesas — G1 Fato ou Fake, UOL Confere,
          Terra / Aos Fatos e Folha / Agência Lupa. Agregação de terceiros, não
          produto oficial do TSE.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {feed.archive?.offline ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-[var(--navy)]">
            ENCERRADO · Arquivo
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--gold)]/50 bg-[#fff8d6] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-[#7a5b00]">
            <span className="live-dot h-2 w-2 rounded-full bg-[var(--green)]" />
            AO VIVO · 2º TURNO
          </span>
        )}
        <CrossingBadge crossing={feed.crossing} />
        <span className="text-xs text-[var(--muted)]">
          {feed.archive?.offline ? "Arquivo" : "Atualizado"}{" "}
          {formatClock(
            feed.archive?.snapshotAt ?? feed.lastIngestAt ?? feed.generatedAt,
          )}
        </span>
        {feed.archive?.offline ? null : (
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-full border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--muted)] hover:border-[var(--navy)] hover:text-[var(--navy)]"
          >
            Atualizar
          </button>
        )}
        <a
          href="/laboratorio"
          className="rounded-full border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--muted)] hover:border-[var(--navy)] hover:text-[var(--navy)]"
        >
          Laboratório
        </a>
      </div>
    </header>
  );
}

function CrossingBadge({ crossing }: { crossing: CrossingMeta }) {
  const label =
    crossing.status === "ready" && crossing.engine === "ollama"
      ? "Consenso Ollama"
      : crossing.status === "pending"
        ? "Cruzando mesas…"
        : "Consenso heurístico";
  return (
    <span className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--navy)]">
      {label}
      {crossing.model ? ` · ${crossing.model}` : ""}
      {crossing.promptVersion ? ` · ${crossing.promptVersion}` : ""}
    </span>
  );
}

function FilterBar({
  filter,
  onFilter,
  sourceFilter,
  onSource,
  sources,
}: {
  filter: string;
  onFilter: (value: string) => void;
  sourceFilter: string;
  onSource: (value: string) => void;
  sources: SourceStatus[];
}) {
  const chips = [
    ["todos", "Todos"],
    ["flavio", "Flávio"],
    ["lula", "Lula"],
    ["fato", "Fato"],
    ["fake", "Fake"],
    ["divergente", "Divergente"],
  ];

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {chips.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => onFilter(id)}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
            filter === id
              ? "border-[var(--navy)] bg-[var(--navy)] text-white"
              : "border-[var(--line)] text-[var(--muted)] hover:text-[var(--navy)]"
          }`}
        >
          {label}
        </button>
      ))}
      <select
        value={sourceFilter}
        onChange={(event) => onSource(event.target.value)}
        className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-xs text-[var(--muted)]"
      >
        <option value="todas">Todas as fontes</option>
        {sources.map((source) => (
          <option key={source.id} value={source.id}>
            {source.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function CandidateMeters({ scores }: { scores: CandidateScore[] }) {
  if (scores.length === 0) return null;
  if (scores.every((score) => score.checksTotal === 0)) return null;
  return (
    <section className="mt-6 grid gap-4 md:grid-cols-2">
      {scores.map((score) => (
        <article
          key={score.candidate}
          className="rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-5 shadow-sm"
        >
          <div className="flex items-start gap-4">
            <CandidatePhoto candidate={score.candidate} size={64} />
            <div className="min-w-0 flex-1">
              <h2
                className="text-2xl font-semibold text-[var(--navy)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {score.name}
              </h2>
              <p className="text-xs text-[var(--muted)]">
                {score.checksTotal} checagens · {score.convergencias} convergências ·{" "}
                {score.divergencias} divergências
              </p>
            </div>
          </div>
          <div className="mt-4">
            <div className="mb-2 flex justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
                  Índice de verdade
                </p>
                <p className="score-num text-4xl font-semibold text-[var(--navy)]">
                  {score.truthIndex}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
                  Índice de mentira
                </p>
                <p className="score-num text-4xl font-semibold text-[var(--navy)]">
                  {score.lieIndex}
                </p>
              </div>
            </div>
            <div className="flex h-3 overflow-hidden rounded-full bg-[var(--bg-elev)]">
              <div
                className="bg-[var(--teal)]"
                style={{ width: `${score.checksTotal ? score.truthIndex : 0}%` }}
              />
              <div
                className="bg-[var(--rose)]"
                style={{ width: `${score.checksTotal ? score.lieIndex : 0}%` }}
              />
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">
              Agregação ponderada das mesas: verdadeiro = 1; contexto / exagerado /
              impreciso = 0,5; falso / insustentável = 0. Sem lote ao vivo, os
              índices ficam em zero.
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {score.verdadeiro} verdadeiro · {score.falso} falso · {score.outros} outros
            </p>
          </div>
        </article>
      ))}
    </section>
  );
}

function ClaimCard({ cluster, index }: { cluster: ClaimCluster; index: number }) {
  const bySource = new Map(cluster.items.map((item) => [item.sourceId, item]));
  const extras = cluster.items.filter(
    (item) => !PRIMARY_SOURCES.some((source) => source.id === item.sourceId),
  );

  return (
    <article
      className="rise-in rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-5 shadow-sm"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {cluster.candidate === "ambos" ? (
            <span className="flex -space-x-2">
              <CandidatePhoto candidate="flavio_bolsonaro" size={56} />
              <CandidatePhoto candidate="lula" size={56} />
            </span>
          ) : (
            (cluster.candidate === "flavio_bolsonaro" ||
              cluster.candidate === "lula") && (
              <CandidatePhoto candidate={cluster.candidate} size={56} />
            )
          )}
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
              {candidateLabel(cluster.candidate)} · {cluster.topic}
            </p>
            <h3
              className="mt-1 max-w-4xl text-xl font-semibold leading-snug text-[var(--navy)] sm:text-2xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {cluster.canonicalClaim}
            </h3>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <ConsensusBadge consensus={cluster.consensus} />
          <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
            {cluster.crossingEngine === "ollama"
              ? "Consenso Ollama"
              : "Consenso heurístico"}
          </span>
        </div>
      </div>
      {cluster.justification && (
        <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
          {cluster.justification}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <StatPill label="Convergências" value={cluster.convergenceCount} tone="teal" />
        <StatPill label="Divergências" value={cluster.divergenceCount} tone="rose" />
        <StatPill label="Consenso" value={`${cluster.consensusScore}`} tone="gold" />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {PRIMARY_SOURCES.map((source) => (
          <OutletCell
            key={source.id}
            short={source.short}
            item={bySource.get(source.id)}
          />
        ))}
        {extras.map((item) => (
          <OutletCell key={item.id} short={item.sourceName} item={item} />
        ))}
      </div>
    </article>
  );
}

function OutletCell({ short, item }: { short: string; item?: FeedItem }) {
  if (!item) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--bg-elev)] px-3 py-3 text-xs text-[var(--muted)]">
        <p className="font-semibold text-[var(--navy)]">{short}</p>
        <p className="mt-1">Aguardando checagens desta fonte</p>
      </div>
    );
  }
  return (
    <a
      href={item.sourceUrl}
      target="_blank"
      rel="noreferrer"
      className="rounded-xl border border-[var(--line)] bg-[var(--bg-elev)] px-3 py-3 transition hover:border-[var(--navy)]/30"
    >
      <p className="text-xs font-semibold text-[var(--navy)]">{short}</p>
      <div className="mt-2">
        {item.verdict ? (
          <VerdictChip verdict={item.verdict} original={item.originalVerdictLabel} />
        ) : (
          <span className="text-xs text-[var(--muted)]">Sem selo</span>
        )}
      </div>
      <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-[var(--muted)]">
        {item.summary}
      </p>
      <p className="mt-2 text-[10px] text-[var(--muted)]">
        {formatRelative(item.publishedAt)} · abrir original
      </p>
    </a>
  );
}

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: "teal" | "rose" | "gold";
}) {
  const color =
    tone === "teal"
      ? "text-[var(--teal)] border-green-200"
      : tone === "rose"
        ? "text-[var(--rose)] border-rose-200"
        : "text-[#7a5b00] border-amber-200";
  return (
    <span className={`rounded-full border bg-white px-2.5 py-1 ${color}`}>
      {label} <strong>{value}</strong>
    </span>
  );
}

function SourcesStrip({ sources }: { sources: SourceStatus[] }) {
  const list =
    sources.length > 0
      ? sources
      : PRIMARY_SOURCES.map((source) => ({
          id: source.id,
          name: source.short,
          homepage: "#",
          liveUrl: null,
          priority: 1,
          online: false,
          mode: "offline" as const,
          lastSuccessAt: null,
          lastError: null,
          lastFetchedAt: null,
          liveCount: 0,
          newsCount: 0,
          factcheckCount: 0,
          note: "Aguardando primeira coleta",
        }));

  return (
    <section className="mt-10">
      <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
        Fontes
      </h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {list.map((source) => (
          <a
            key={source.id}
            href={source.liveUrl || source.homepage}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-[var(--line)] bg-[var(--bg-card)] p-4 shadow-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-[var(--navy)]">{source.name}</p>
              <ModeBadge mode={source.mode} online={source.online} />
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]">
              {source.factcheckCount} checagens · {source.newsCount} notas · última
              coleta {formatClock(source.lastFetchedAt)}
            </p>
            {source.factcheckCount === 0 && (
              <p className="mt-2 text-[11px] text-[var(--muted)]">
                Aguardando checagens desta fonte
              </p>
            )}
            {source.note && (
              <p className="mt-2 line-clamp-3 text-[11px] leading-relaxed text-[var(--muted)]">
                {source.note}
              </p>
            )}
          </a>
        ))}
      </div>
    </section>
  );
}

function ModeBadge({
  mode,
  online,
}: {
  mode: SourceStatus["mode"];
  online: boolean;
}) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
        online
          ? "border-green-300 text-[var(--green-deep)]"
          : "border-[var(--line)] text-[var(--muted)]"
      }`}
    >
      {mode === "live" ? "LIVE" : "OFF"}
    </span>
  );
}

function MethodologyFooter() {
  return (
    <footer className="mt-12 border-t border-[var(--line)] pt-6 text-sm leading-relaxed text-[var(--muted)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--navy)]">
        Agregação jornalística · não é produto oficial do TSE
      </p>
      <h2 className="mt-2 text-[var(--navy)]">Metodologia</h2>
      <p className="mt-2">
        O CrossNews não inventa vereditos. Só entra no painel o que foi coletado
        das mesas, com link para o original. A mesma afirmação é agrupada por
        candidato e texto normalizado. Convergência é o maior bloco de selos;
        divergência é o restante.
      </p>
      <p className="mt-2">
        G1: #FATO, #FAKE, #NÃOÉBEMASSIM. UOL Confere: verdadeiro, falso,
        exagerado, impreciso. Aos Fatos (Terra): VERDADEIRO, FALSO, NÃO É BEM
        ASSIM, ENGANOSO, SUBESTIMADO. Folha / Lupa: verdadeira, falsa,
        exagerada, falta contexto, subestimado. O cruzamento semântico (Ollama)
        roda em segundo plano; o painel nunca espera o modelo. Sem Ollama, o
        consenso heurístico permanece.
      </p>
      <p className="mt-4 text-xs">
        CrossNews é ferramenta de redação cívica. Não representa o TSE, a Rede
        Globo, partidos ou campanhas. Se uma mesa ainda não publicou, o espaço
        fica vazio — sem simulação.{" "}
        <a
          href="/laboratorio"
          className="underline underline-offset-2 hover:text-[var(--navy)]"
        >
          Como funciona (laboratório + notebook Colab)
        </a>
        .
      </p>
      <p className="mt-3 text-xs">
        Fotos:{" "}
        <a
          href={TSE_DIVULGA_HOME}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-[var(--navy)]"
        >
          TSE / DivulgaCand
        </a>
        {" · "}
        retratos oficiais de urna das Eleições 2026 (
        <a
          href={TSE_DIVULGA_BR}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-[var(--navy)]"
        >
          Presidente · BR
        </a>
        ,{" "}
        <a
          href={TSE_DADOS_ABERTOS}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-[var(--navy)]"
        >
          Dados Abertos
        </a>
        ).
      </p>
    </footer>
  );
}

function EmptyState({ title }: { title: string }) {
  return (
    <div className="mt-8 rounded-2xl border border-dashed border-[var(--line)] bg-white px-6 py-16 text-center text-[var(--muted)]">
      {title}
    </div>
  );
}
