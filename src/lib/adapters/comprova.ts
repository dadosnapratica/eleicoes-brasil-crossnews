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

export const COMPROVA_HOME_URL = "https://projetocomprova.com.br/";
export const COMPROVA_PUB_URL =
  "https://projetocomprova.com.br/publica%C3%A7%C3%B5es/";
export const COMPROVA_PLANTAO_URL =
  "https://projetocomprova.com.br/publica%C3%A7%C3%B5es/projeto-comprova-anuncia-plantao-especial-para-o-debate-na-tv-globo-e-fim-de-semana-eleitoral-e-reforca-servico-consulte-o-comprova/";
export const COMPROVA_FEED_URL = "https://projetocomprova.com.br/feed/";

const SOURCE_ID = "comprova";
const SOURCE_NAME = "Projeto Comprova";

function parseBrDate(raw: string): string | undefined {
  const match = raw.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return undefined;
  const d = new Date(`${match[3]}-${match[2]}-${match[1]}T15:00:00-03:00`);
  return Number.isNaN(+d) ? undefined : d.toISOString();
}

function toItem(input: {
  url: string;
  title: string;
  summary: string;
  publishedAt?: string;
  forceKind?: ItemKind;
}): FeedItem {
  const text = `${input.title} ${input.summary}`;
  const isPlantao = input.url.includes("plantao-especial-para-o-debate");
  const detected = detectVerdict(text);
  const kind: ItemKind =
    input.forceKind ??
    (isPlantao
      ? "news"
      : detected || looksLikeFactCheck(text)
        ? "factcheck"
        : "news");
  return {
    id: `${SOURCE_ID}_${hashId([input.url])}`,
    kind,
    sourceId: SOURCE_ID,
    sourceName: SOURCE_NAME,
    sourceUrl: input.url,
    title: input.title,
    claim: input.title
      .replace(/^é\s+(falso|falsa|verdadeiro|verdadeira)\s+/i, "")
      .trim(),
    verdict: kind === "factcheck" ? detected?.verdict ?? "inconclusivo" : null,
    originalVerdictLabel: kind === "factcheck" ? detected?.label ?? null : null,
    summary: input.summary || input.title,
    candidate: inferCandidate(text),
    topic: isPlantao ? "metodologia" : inferTopic(text),
    publishedAt: input.publishedAt ?? new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
  };
}

export function extractComprovaListing(html: string): FeedItem[] {
  const items: FeedItem[] = [];
  const seen = new Set<string>();

  const headingRe =
    /<h[123][^>]*>([\s\S]*?)<\/h[123]>/gi;
  let match: RegExpExecArray | null;
  while ((match = headingRe.exec(html))) {
    const title = stripHtml(match[1]).replace(/\s+/g, " ").trim();
    if (title.length < 28) continue;
    if (/^(eleições|comunicados|contextualizando|comprova explica)$/i.test(title)) {
      continue;
    }
    const window = html.slice(Math.max(0, match.index - 800), match.index + 900);
    const href =
      window.match(
        /href=["'](https?:\/\/projetocomprova\.com\.br\/publica[^"']+|\/publica[^"']+)["']/i,
      )?.[1] ?? "";
    if (!href) continue;
    const url = href.startsWith("http")
      ? href
      : new URL(href, COMPROVA_HOME_URL).toString();
    if (seen.has(url)) continue;
    seen.add(url);
    const around = stripHtml(window).replace(/\s+/g, " ");
    items.push(
      toItem({
        url,
        title,
        summary: around.slice(0, 360),
        publishedAt: parseBrDate(around),
      }),
    );
  }

  const anchors = extractAnchors(html, (href) =>
    /projetocomprova\.com\.br\/publica|\/publica/i.test(href),
  );
  for (const anchor of anchors) {
    const title = stripHtml(anchor.title).replace(/\s+/g, " ").trim();
    if (title.length < 28) continue;
    const url = anchor.href.startsWith("http")
      ? anchor.href
      : new URL(anchor.href, COMPROVA_HOME_URL).toString();
    if (seen.has(url)) continue;
    seen.add(url);
    items.push(toItem({ url, title, summary: title }));
  }

  return items;
}

export const comprovaAdapter: SourceAdapter = {
  id: SOURCE_ID,
  name: SOURCE_NAME,
  homepage: COMPROVA_HOME_URL,
  liveUrl: COMPROVA_PLANTAO_URL,
  priority: 1,
  pollMs: 45_000,

  async fetchLatest(): Promise<AdapterResult> {
    const fetchedAt = new Date().toISOString();
    const bag = new Map<string, FeedItem>();
    const errors: string[] = [];
    let anyOk = false;

    for (const url of [COMPROVA_HOME_URL, COMPROVA_PUB_URL, COMPROVA_PLANTAO_URL]) {
      const page = await fetchText(url, 15000);
      if (!page.ok) {
        errors.push(`${url}: ${page.error}`);
        continue;
      }
      anyOk = true;
      for (const item of extractComprovaListing(page.text)) {
        if (!bag.has(item.id)) bag.set(item.id, item);
      }
    }

    const rss = await fetchText(COMPROVA_FEED_URL, 10000);
    if (rss.ok) {
      anyOk = true;
      for (const entry of parseRssItems(rss.text)) {
        if (/hello world|test document/i.test(entry.title)) continue;
        const item = toItem({
          url: entry.link,
          title: entry.title,
          summary: stripHtml(entry.description).slice(0, 320),
          publishedAt: entry.pubDate
            ? new Date(entry.pubDate).toISOString()
            : undefined,
        });
        if (!bag.has(item.id)) bag.set(item.id, item);
      }
    } else {
      errors.push(`rss: ${rss.error}`);
    }

    return {
      items: [...bag.values()],
      status: {
        id: SOURCE_ID,
        name: SOURCE_NAME,
        homepage: COMPROVA_HOME_URL,
        liveUrl: COMPROVA_PLANTAO_URL,
        priority: 1,
        online: anyOk,
        lastSuccessAt: anyOk ? fetchedAt : null,
        lastError: anyOk ? null : errors[0] ?? "falha Projeto Comprova",
        lastFetchedAt: fetchedAt,
        note: "Plantão do debate + listagem de publicações. Checa virais da noite; declaração de candidato só entra se a mesa publicar.",
      },
    };
  },
};
