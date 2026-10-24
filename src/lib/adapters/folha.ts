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

export const FOLHA_ANNOUNCE_URL =
  "https://www1.folha.uol.com.br/poder/2026/10/folha-e-agencia-lupa-farao-checagem-ao-vivo-durante-debate-da-tv-globo.shtml";

export const FOLHA_LIVE_URL =
  "https://aovivo.folha.uol.com.br/poder/2026/10/23/6566-flavio-bolsonaro-e-lula-participam-de-ultimo-debate-das-eleicoes-na-globo-acompanhe.shtml";

export const LUPA_HOME_URL = "https://lupa.uol.com.br/";
export const LUPA_LIVE_URL =
  "https://www.agencialupa.org/checagem/2026/10/23/ao-vivo-checagem-do-ultimo-debate-entre-lula-e-flavio-bolsonaro-no-segundo-turno";
export const LUPA_JOURNAL_URL = "https://lupa.uol.com.br/jornalismo";
export const LUPA_RSS = [
  "https://lupa.uol.com.br/feed",
  "https://piaui.folha.uol.com.br/lupa/feed/",
];

const SOURCE_ID = "folha_lupa";
const SOURCE_NAME = "Folha / Agência Lupa";

function toItem(input: {
  url: string;
  title: string;
  summary: string;
  publishedAt?: string;
  forceKind?: ItemKind;
}): FeedItem {
  const text = `${input.title} ${input.summary}`;
  const detected = detectVerdict(text);
  const isAnnounce = input.url.includes(
    "folha-e-agencia-lupa-farao-checagem",
  );
  const kind: ItemKind =
    input.forceKind ??
    (isAnnounce
      ? "news"
      : detected || looksLikeFactCheck(text)
        ? "factcheck"
        : "news");

  return {
    id: `${SOURCE_ID}_${hashId([input.url, input.title])}`,
    kind,
    sourceId: SOURCE_ID,
    sourceName: SOURCE_NAME,
    sourceUrl: input.url,
    title: input.title,
    claim:
      input.title
        .replace(
          /é\s*(falso|falsa|verdadeiro|verdadeira|exagerado|exagerada)/gi,
          "",
        )
        .replace(/falta contexto/gi, "")
        .replace(/^[:\-–—\s]+/, "")
        .trim() || input.title,
    verdict: kind === "factcheck" ? detected?.verdict ?? "inconclusivo" : null,
    originalVerdictLabel: kind === "factcheck" ? detected?.label ?? null : null,
    summary: input.summary || input.title,
    candidate: inferCandidate(text),
    topic: isAnnounce ? "metodologia" : inferTopic(text),
    publishedAt: input.publishedAt ?? new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
   
  };
}

function parseDate(value?: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(+d) ? undefined : d.toISOString();
}

const LUPA_SEAL =
  /^(SUBESTIMADO|SUPERESTIMADO|EXAGERADO|FALTA CONTEXTO|VERDADEIRA|VERDADEIRO|FALSA|FALSO|ENGANOSO|IMPRECISO)$/i;

function extractLupaLiveChecks(html: string, pageUrl: string): FeedItem[] {
  const items: FeedItem[] = [];
  const seen = new Set<string>();
  const re =
    /<blockquote[\s\S]*?<\/blockquote>[\s\S]{0,1800}?<strong>([^<]+)<\/strong>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const block = match[0];
    const label = match[1].replace(/\s+/g, " ").trim();
    if (!LUPA_SEAL.test(label)) continue;
    const quote = stripHtml(
      block.match(/<blockquote[\s\S]*?<\/blockquote>/i)?.[0] ?? "",
    )
      .replace(/\s+/g, " ")
      .replace(
        /\s*(Luiz Inácio Lula da Silva|Flávio Bolsonaro|Flavio Bolsonaro).*$/i,
        "",
      )
      .replace(/^["“]+|["”]+$/g, "")
      .trim();
    if (quote.length < 20) continue;
    const key = quote.slice(0, 72);
    if (seen.has(key)) continue;
    seen.add(key);
    const cite =
      stripHtml(block.match(/<cite[^>]*>([\s\S]*?)<\/cite>/i)?.[1] ?? "") ||
      label;
    items.push(
      toItem({
        url: `${pageUrl}#${hashId([quote])}`,
        title: quote,
        summary: `${label}. ${cite}`.slice(0, 360),
        publishedAt: "2026-10-24T01:51:00.000Z",
        forceKind: "factcheck",
      }),
    );
  }
  return items;
}

function extractFolhaLivePosts(html: string): FeedItem[] {
  const items: FeedItem[] = [];
  const seen = new Set<string>();

  const blockRe =
    /<(?:article|li|div)[^>]*(?:live|post|item|bullet)[^>]*>([\s\S]*?)<\/(?:article|li|div)>/gi;
  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(html))) {
    const chunk = match[1];
    const title =
      stripHtml(
        chunk.match(/<(?:h[1-4]|strong|p)[^>]*>([\s\S]*?)<\/(?:h[1-4]|strong|p)>/i)?.[1] ??
          "",
      );
    if (title.length < 28) continue;
    const key = title.slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    const href =
      chunk.match(/href=["']([^"']+)["']/)?.[1] ?? FOLHA_LIVE_URL;
    items.push(
      toItem({
        url: href.startsWith("http")
          ? href
          : new URL(href, FOLHA_LIVE_URL).toString(),
        title,
        summary: stripHtml(chunk).slice(0, 360),
      }),
    );
  }

  const anchors = extractAnchors(html, (href) =>
    /folha\.uol\.com\.br|lupa\.uol\.com\.br|aovivo\.folha/.test(href),
  );
  for (const anchor of anchors.slice(0, 35)) {
    if (seen.has(anchor.title.slice(0, 80))) continue;
    seen.add(anchor.title.slice(0, 80));
    items.push(
      toItem({
        url: anchor.href,
        title: anchor.title,
        summary: anchor.title,
      }),
    );
  }
  return items;
}

export const folhaAdapter: SourceAdapter = {
  id: SOURCE_ID,
  name: SOURCE_NAME,
  homepage: LUPA_HOME_URL,
  liveUrl: LUPA_LIVE_URL,
  priority: 1,
  pollMs: 25_000,

  async fetchLatest(): Promise<AdapterResult> {
    const fetchedAt = new Date().toISOString();
    const bag = new Map<string, FeedItem>();
    const errors: string[] = [];
    let anyOk = false;

    bag.set(
      FOLHA_ANNOUNCE_URL,
      toItem({
        url: FOLHA_ANNOUNCE_URL,
        title:
          "Folha e Agência Lupa farão checagem ao vivo durante o debate da TV Globo",
        summary:
          "Etiquetas: verdadeira, falsa, exagerada ou falta contexto. Texto no site da Folha, análise detalhada na Lupa. Cinco lives no Instagram (@folhadespaulo e @agencia_lupa). Sistema Lupita + 20 jornalistas. Apuração segue após o programa.",
        publishedAt: "2026-10-22T16:51:00.000Z",
        forceKind: "news",
      }),
    );

    const announce = await fetchText(FOLHA_ANNOUNCE_URL);
    if (announce.ok) anyOk = true;
    else errors.push(`folha anúncio: ${announce.error}`);

    const live = await fetchText(FOLHA_LIVE_URL, 15000);
    if (live.ok) {
      anyOk = true;
      for (const item of extractFolhaLivePosts(live.text)) {
        bag.set(item.id, item);
      }
      bag.set(
        FOLHA_LIVE_URL,
        toItem({
          url: FOLHA_LIVE_URL,
          title:
            "Folha Ao Vivo: Flávio Bolsonaro e Lula no último debate das eleições na Globo",
          summary:
            "Liveblog da Folha do debate. Checagens da parceria Folha/Lupa e relatos de radar entram nesta cobertura.",
          publishedAt: "2026-10-24T00:20:00.000Z",
          forceKind: "news",
        }),
      );
    } else {
      errors.push(`folha ao vivo: ${live.error}`);
    }

    const lupaLive = await fetchText(LUPA_LIVE_URL, 15000);
    if (lupaLive.ok) {
      anyOk = true;
      for (const item of extractLupaLiveChecks(lupaLive.text, LUPA_LIVE_URL)) {
        bag.set(item.id, item);
      }
    } else {
      errors.push(`lupa live: ${lupaLive.error}`);
    }

    const lupaHome = await fetchText(LUPA_HOME_URL);
    if (lupaHome.ok) {
      anyOk = true;
      const anchors = extractAnchors(lupaHome.text, (href) =>
        /lupa\.uol\.com\.br|agencialupa/.test(href),
      );
      for (const anchor of anchors.slice(0, 25)) {
        const item = toItem({
          url: anchor.href,
          title: anchor.title,
          summary: anchor.title,
        });
        if (!bag.has(item.id)) bag.set(item.id, item);
      }
    } else {
      errors.push(`lupa: ${lupaHome.error}`);
    }

    for (const feed of LUPA_RSS) {
      const rss = await fetchText(feed);
      if (!rss.ok) {
        errors.push(`${feed}: ${rss.error}`);
        continue;
      }
      anyOk = true;
      for (const entry of parseRssItems(rss.text).slice(0, 20)) {
        const item = toItem({
          url: entry.link,
          title: entry.title,
          summary: stripHtml(entry.description).slice(0, 320),
          publishedAt: parseDate(entry.pubDate),
        });
        if (!bag.has(item.id)) bag.set(item.id, item);
      }
      break;
    }

    return {
      items: [...bag.values()],
      status: {
        id: SOURCE_ID,
        name: SOURCE_NAME,
        homepage: LUPA_HOME_URL,
        liveUrl: LUPA_LIVE_URL,
        priority: 1,
        online: anyOk,
        lastSuccessAt: anyOk ? fetchedAt : null,
        lastError: anyOk ? null : errors[0] ?? "falha Folha/Lupa",
        lastFetchedAt: fetchedAt,
        note: `Checagens no texto vivo da Lupa. Folha Ao Vivo é shell JS. Live: ${LUPA_LIVE_URL}. Etiquetas: verdadeira, falsa, exagerada, falta contexto, subestimado.`,
      },
    };
  },
};
