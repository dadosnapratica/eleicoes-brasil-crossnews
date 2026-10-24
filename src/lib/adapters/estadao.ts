import type { CandidateId, FeedItem, ItemKind } from "../types";
import { hashId, inferTopic, stripHtml } from "../normalize";
import { detectVerdict } from "../verdict";
import { fetchText } from "../http";
import type { AdapterResult, SourceAdapter } from "./types";

export const ESTADAO_HOME_URL = "https://www.estadao.com.br/estadao-verifica/";
export const ESTADAO_LIVE_URL =
  "https://www.estadao.com.br/estadao-verifica/debate-tv-globo-checagem-tempo-real-ao-vivo/";

const SOURCE_ID = "estadao_verifica";
const SOURCE_NAME = "Estadão Verifica";

const SEAL =
  /^(falso|enganoso|exagerado|subestimado|impreciso|verdadeiro|falta contexto)$/i;

function toItem(input: {
  url: string;
  title: string;
  summary: string;
  publishedAt?: string;
  candidate?: CandidateId;
  forceKind?: ItemKind;
}): FeedItem {
  const text = `${input.title} ${input.summary}`;
  const detected = detectVerdict(text);
  const kind: ItemKind = input.forceKind ?? "factcheck";
  return {
    id: `${SOURCE_ID}_${hashId([input.url, input.title])}`,
    kind,
    sourceId: SOURCE_ID,
    sourceName: SOURCE_NAME,
    sourceUrl: input.url,
    title: input.title,
    claim: input.title,
    verdict: kind === "factcheck" ? detected?.verdict ?? "inconclusivo" : null,
    originalVerdictLabel: kind === "factcheck" ? detected?.label ?? null : null,
    summary: input.summary || input.title,
    candidate: input.candidate ?? "nenhum",
    topic: inferTopic(text),
    publishedAt: input.publishedAt ?? new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
  };
}

function cleanArticle(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<div[^>]*ads-container[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n");
}

export function extractEstadaoLiveChecks(
  html: string,
  pageUrl: string,
): FeedItem[] {
  const text = stripHtml(cleanArticle(html));
  const chunks = text.split(/(?=O que (?:Lula|Flávio) disse:)/i);
  const items: FeedItem[] = [];
  const seen = new Set<string>();

  for (const chunk of chunks) {
    const match = chunk.match(
      /O que (Lula|Flávio) disse:\s*([\s\S]+?)\s*O Estadão Verifica (?:checou|investigou) e concluiu que:\s*(?:é\s+)?(falso|enganoso|exagerado|subestimado|impreciso|verdadeiro|falta contexto)\b/i,
    );
    if (!match) continue;
    const who = /lula/i.test(match[1]) ? "lula" : "flavio_bolsonaro";
    const claim = match[2]
      .replace(/^que[,\s]+/i, "")
      .replace(/\s+/g, " ")
      .trim();
    const seal = match[3].replace(/\s+/g, " ").trim();
    if (claim.length < 20 || !SEAL.test(seal)) continue;
    const key = claim.slice(0, 72).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const excerpt = chunk.replace(/\s+/g, " ").slice(0, 360);
    const item = toItem({
      url: `${pageUrl}#${hashId([claim])}`,
      title: claim,
      summary: `${seal}. ${excerpt}`,
      publishedAt: "2026-10-24T02:06:00.000Z",
      candidate: who,
      forceKind: "factcheck",
    });
    const sealed = detectVerdict(seal);
    if (sealed) {
      item.verdict = sealed.verdict;
      item.originalVerdictLabel = sealed.label;
    }
    items.push(item);
  }
  return items;
}

export const estadaoAdapter: SourceAdapter = {
  id: SOURCE_ID,
  name: SOURCE_NAME,
  homepage: ESTADAO_HOME_URL,
  liveUrl: ESTADAO_LIVE_URL,
  priority: 1,
  pollMs: 30_000,

  async fetchLatest(): Promise<AdapterResult> {
    const fetchedAt = new Date().toISOString();
    const errors: string[] = [];
    const items: FeedItem[] = [];
    let anyOk = false;

    const live = await fetchText(ESTADAO_LIVE_URL, 15000);
    if (live.ok) {
      anyOk = true;
      items.push(...extractEstadaoLiveChecks(live.text, ESTADAO_LIVE_URL));
    } else {
      errors.push(`ao vivo: ${live.error}`);
    }

    const home = await fetchText(ESTADAO_HOME_URL, 12000);
    if (home.ok) anyOk = true;
    else errors.push(`home: ${home.error}`);

    return {
      items,
      status: {
        id: SOURCE_ID,
        name: SOURCE_NAME,
        homepage: ESTADAO_HOME_URL,
        liveUrl: ESTADAO_LIVE_URL,
        priority: 1,
        online: anyOk,
        lastSuccessAt: anyOk ? fetchedAt : null,
        lastError: anyOk ? null : errors[0] ?? "falha Estadão Verifica",
        lastFetchedAt: fetchedAt,
        note: `Checagem ao vivo do debate da Globo. Selos: falso, enganoso, exagerado, subestimado, impreciso, falta contexto, verdadeiro. ${ESTADAO_LIVE_URL}`,
      },
    };
  },
};
