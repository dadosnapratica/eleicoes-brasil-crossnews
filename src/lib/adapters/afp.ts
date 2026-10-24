import type { FeedItem, ItemKind } from "../types";
import {
  hashId,
  inferCandidate,
  inferTopic,
  stripHtml,
} from "../normalize";
import { detectVerdict, looksLikeFactCheck } from "../verdict";
import { extractAnchors, fetchText } from "../http";
import type { AdapterResult, SourceAdapter } from "./types";

export const AFP_HOME_URL = "https://checamos.afp.com/";
export const AFP_ELEICOES_URL = "https://checamos.afp.com/list/Eleicoes-2026";

const SOURCE_ID = "afp_chegamos";
const SOURCE_NAME = "AFP Chegamos";

function cleanTitle(raw: string): string {
  return raw
    .replace(/^Imagem\s+/i, "")
    .replace(/Inteligência Artificial\s+/gi, "")
    .replace(/Eleições 2026\s+/gi, "")
    .replace(/Publicado em \d{2}\/\d{2}\/\d{4}\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDate(raw: string): string | undefined {
  const match = raw.match(/Publicado em (\d{2})\/(\d{2})\/(\d{4})/i);
  if (!match) return undefined;
  const iso = `${match[3]}-${match[2]}-${match[1]}T15:00:00-03:00`;
  const d = new Date(iso);
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
  const detected = detectVerdict(text);
  const kind: ItemKind =
    input.forceKind ??
    (detected || looksLikeFactCheck(text) ? "factcheck" : "news");
  return {
    id: `${SOURCE_ID}_${hashId([input.url])}`,
    kind,
    sourceId: SOURCE_ID,
    sourceName: SOURCE_NAME,
    sourceUrl: input.url,
    title: input.title,
    claim: input.title,
    verdict: kind === "factcheck" ? detected?.verdict ?? "inconclusivo" : null,
    originalVerdictLabel: kind === "factcheck" ? detected?.label ?? null : null,
    summary: input.summary || input.title,
    candidate: inferCandidate(text),
    topic: inferTopic(text),
    publishedAt: input.publishedAt ?? new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
  };
}

export function extractAfpListing(html: string): FeedItem[] {
  const items: FeedItem[] = [];
  const seen = new Set<string>();
  const anchors = extractAnchors(html, (href) => /doc\.afp\.com\./.test(href));
  for (const anchor of anchors) {
    const title = cleanTitle(anchor.title);
    if (title.length < 24) continue;
    const href = anchor.href.startsWith("http")
      ? anchor.href
      : new URL(anchor.href, AFP_HOME_URL).toString();
    if (seen.has(href)) continue;
    seen.add(href);
    items.push(
      toItem({
        url: href,
        title,
        summary: title,
        publishedAt: parseDate(anchor.title),
      }),
    );
  }
  return items;
}

export const afpAdapter: SourceAdapter = {
  id: SOURCE_ID,
  name: SOURCE_NAME,
  homepage: AFP_HOME_URL,
  liveUrl: AFP_ELEICOES_URL,
  priority: 1,
  pollMs: 45_000,

  async fetchLatest(): Promise<AdapterResult> {
    const fetchedAt = new Date().toISOString();
    const bag = new Map<string, FeedItem>();
    const errors: string[] = [];
    let anyOk = false;

    const listingUrls = [
      AFP_HOME_URL,
      AFP_ELEICOES_URL,
      "https://factcheck.afp.com/",
    ];
    for (const url of listingUrls) {
      const page = await fetchText(url, 15000);
      if (!page.ok) {
        errors.push(`${url}: ${page.error}`);
        continue;
      }
      anyOk = true;
      for (const item of extractAfpListing(page.text)) {
        if (!bag.has(item.id)) bag.set(item.id, item);
      }
    }

    return {
      items: [...bag.values()],
      status: {
        id: SOURCE_ID,
        name: SOURCE_NAME,
        homepage: AFP_HOME_URL,
        liveUrl: AFP_ELEICOES_URL,
        priority: 1,
        online: anyOk,
        lastSuccessAt: anyOk ? fetchedAt : null,
        lastError: anyOk ? null : errors[0] ?? "falha AFP Chegamos",
        lastFetchedAt: fetchedAt,
        note: anyOk
          ? "Listagem Checamos + tópico Eleições 2026. Sem página ao vivo do debate da Globo até agora; home só entra declaração de candidato desta noite."
          : errors[0] ?? null,
      },
    };
  },
};
