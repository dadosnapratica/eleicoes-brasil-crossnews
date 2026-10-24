import type { FeedItem, ItemKind } from "../types";
import {
  hashId,
  inferCandidate,
  inferTopic,
  stripHtml,
} from "../normalize";
import { detectVerdict, looksLikeFactCheck } from "../verdict";
import { extractAnchors, fetchText, parseRssItems } from "../http";
import type { AdapterResult, SourceAdapter } from "./types";

export const G1_METHODOLOGY_URL =
  "https://g1.globo.com/fato-ou-fake/eleicoes/noticia/2026/10/22/saiba-como-o-fato-ou-fake-checara-declaracoes-dos-candidatos-no-debate-de-2-turno-da-globo.ghtml";

export const G1_DEBATE_URL =
  "https://g1.globo.com/fato-ou-fake/eleicoes/noticia/2026/10/23/veja-o-que-e-fato-ou-fake-nas-falas-de-flavio-bolsonaro-e-lula-no-debate-da-globo-no-2o-turno-das-eleicoes-2026.ghtml";

export const G1_ELEICOES_URL = "https://g1.globo.com/fato-ou-fake/eleicoes/";
export const G1_HOME_URL = "https://g1.globo.com/fato-ou-fake/";
export const G1_RSS_URLS = [
  "https://g1.globo.com/rss/g1/fato-ou-fake/eleicoes/",
  "https://g1.globo.com/rss/g1/fato-ou-fake/",
  "https://g1.globo.com/dynamo/fato-ou-fake/rss2.xml",
];

const SOURCE_ID = "g1_fato_ou_fake";
const SOURCE_NAME = "G1 Fato ou Fake";

function toItem(input: {
  url: string;
  title: string;
  summary: string;
  publishedAt?: string;
}): FeedItem {
  const text = `${input.title} ${input.summary}`;
  const detected = detectVerdict(text);
  const isMethodo = input.url.includes(
    "saiba-como-o-fato-ou-fake-checara-declaracoes",
  );
  const isRoundup =
    /veja-o-que-e-fato-ou-fake-nas-falas/.test(input.url) &&
    !input.url.includes("#");
  const isFoF = /fato-ou-fake/.test(input.url) || looksLikeFactCheck(text);
  const kind: ItemKind =
    isMethodo || isRoundup
      ? "news"
      : isFoF || detected
        ? "factcheck"
        : "news";

  const claim = input.title
    .replace(/é\s*#\s*(fato|fake)/gi, "")
    .replace(/#\s*(fato|fake|nãoébémassim|naoebemassim)/gi, "")
    .replace(/^[:\-–—\s]+/, "")
    .trim();

  return {
    id: `g1_${hashId([input.url])}`,
    kind: isMethodo ? "news" : kind,
    sourceId: SOURCE_ID,
    sourceName: SOURCE_NAME,
    sourceUrl: input.url,
    title: input.title,
    claim: isMethodo
      ? "Metodologia Fato ou Fake para o debate de 2º turno da Globo"
      : claim || input.title,
    verdict:
      isMethodo || isRoundup
        ? null
        : detected?.verdict ?? (kind === "factcheck" ? "inconclusivo" : null),
    originalVerdictLabel: isMethodo || isRoundup ? null : detected?.label ?? null,
    summary: input.summary || input.title,
    candidate: inferCandidate(text),
    topic: isMethodo ? "metodologia" : inferTopic(text),
    publishedAt: input.publishedAt ?? new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
  };
}

function parseDate(value?: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(+d) ? undefined : d.toISOString();
}

function extractDebateArticleChecks(html: string, pageUrl: string): FeedItem[] {
  const items: FeedItem[] = [];
  const seen = new Set<string>();
  const re = /<blockquote[^>]*>([\s\S]*?)<\/blockquote>([\s\S]{0,2800})/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const quote = stripHtml(match[1]).replace(/^["“]+|["”]+$/g, "").trim();
    if (quote.length < 24) continue;
    const key = quote.slice(0, 72);
    if (seen.has(key)) continue;
    seen.add(key);
    const after = stripHtml(match[2]).slice(0, 360);
    const detected = detectVerdict(`${quote} ${after}`);
    items.push(
      toItem({
        url: `${pageUrl}#${hashId([quote])}`,
        title: quote,
        summary: after || quote,
        publishedAt: "2026-10-24T01:15:00.000Z",
      }),
    );
    if (detected) {
      const last = items[items.length - 1];
      last.verdict = detected.verdict;
      last.originalVerdictLabel = detected.label;
      last.kind = "factcheck";
    }
  }
  return items;
}

export const g1Adapter: SourceAdapter = {
  id: SOURCE_ID,
  name: SOURCE_NAME,
  homepage: G1_HOME_URL,
  liveUrl: G1_DEBATE_URL,
  priority: 1,
  pollMs: 45_000,

  async fetchLatest(): Promise<AdapterResult> {
    const fetchedAt = new Date().toISOString();
    const items = new Map<string, FeedItem>();
    const errors: string[] = [];
    let anyOk = false;

    const methodo = await fetchText(G1_METHODOLOGY_URL);
    if (methodo.ok) {
      anyOk = true;
      const titleMatch = methodo.text.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      items.set(
        G1_METHODOLOGY_URL,
        toItem({
          url: G1_METHODOLOGY_URL,
          title:
            titleMatch?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ||
            "Saiba como o Fato ou Fake checará declarações no debate de 2º turno da Globo",
          summary:
            "O Fato ou Fake classifica afirmações de Lula e Flávio Bolsonaro como #FATO, #FAKE ou #NÃOÉBEMASSIM. Primeiras checagens saem durante o debate no g1, O Globo, Valor, Extra e CBN.",
          publishedAt: "2026-10-22T16:42:00.000Z",
        }),
      );
    } else {
      errors.push(`metodologia: ${methodo.error}`);
      items.set(
        G1_METHODOLOGY_URL,
        toItem({
          url: G1_METHODOLOGY_URL,
          title:
            "Saiba como o Fato ou Fake checará declarações no debate de 2º turno da Globo",
          summary:
            "Artigo oficial do g1 sobre a cobertura de checagem do debate. Página não pôde ser relida agora; URL preservada.",
          publishedAt: "2026-10-22T16:42:00.000Z",
        }),
      );
    }

    const debate = await fetchText(G1_DEBATE_URL);
    if (debate.ok) {
      anyOk = true;
      for (const item of extractDebateArticleChecks(debate.text, G1_DEBATE_URL)) {
        items.set(item.id, item);
      }
    } else {
      errors.push(`debate: ${debate.error}`);
    }

    for (const rssUrl of G1_RSS_URLS) {
      const rss = await fetchText(rssUrl);
      if (!rss.ok) {
        errors.push(`${rssUrl}: ${rss.error}`);
        continue;
      }
      anyOk = true;
      for (const entry of parseRssItems(rss.text)) {
        if (!/fato-ou-fake|eleic/i.test(entry.link + entry.title)) continue;
        const item = toItem({
          url: entry.link,
          title: entry.title,
          summary: stripHtml(entry.description).slice(0, 320),
          publishedAt: parseDate(entry.pubDate),
        });
        items.set(item.sourceUrl, item);
      }
    }

    for (const pageUrl of [G1_ELEICOES_URL, G1_HOME_URL]) {
      const page = await fetchText(pageUrl);
      if (!page.ok) {
        errors.push(`${pageUrl}: ${page.error}`);
        continue;
      }
      anyOk = true;
      const anchors = extractAnchors(page.text, (href) =>
        /g1\.globo\.com\/fato-ou-fake\//.test(href),
      );
      for (const anchor of anchors.slice(0, 40)) {
        const item = toItem({
          url: anchor.href,
          title: anchor.title,
          summary: anchor.title,
        });
        if (!items.has(item.sourceUrl)) items.set(item.sourceUrl, item);
      }
    }

    const list = [...items.values()];
    return {
      items: list,
      status: {
        id: SOURCE_ID,
        name: SOURCE_NAME,
        homepage: G1_HOME_URL,
        liveUrl: G1_DEBATE_URL,
        priority: 1,
        online: anyOk,
        lastSuccessAt: anyOk ? fetchedAt : null,
        lastError: anyOk ? null : errors[0] ?? "falha ao coletar G1",
        lastFetchedAt: fetchedAt,
        note: "Fonte primária. Selos oficiais: #FATO, #FAKE e #NÃOÉBEMASSIM. Primeiras checagens do debate saem no g1 durante o programa.",
      },
    };
  },
};
