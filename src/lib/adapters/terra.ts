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

export const TERRA_ANNOUNCE_URL =
  "https://www.terra.com.br/noticias/eleicoes/terra-e-aos-fatos-farao-checagem-em-tempo-real-do-debate-final-entre-flavio-e-lula-na-globo,0926a643fcdeaefbd0b8647dfe2279813dfz965h.html";

export const TERRA_LIVE_URL =
  "https://www.terra.com.br/ao-vivo/noticias/eleicoes/debate-da-globo-acompanhe-a-checagem-ao-vivo-realizada-pelo-terra-e-aos-fatos,ac675796e16b1783f2f970e8c4fbf4f8ppkgasp4.html";
export const TERRA_CHECAMOS_URL = "https://www.terra.com.br/noticias/checamos/";
export const AOS_FATOS_LIVE_URL =
  "https://www.aosfatos.org/noticias/checamos-flavio-bolsonaro-lula-debate-globo/";
export const AOS_FATOS_METHOD_URL =
  "https://www.aosfatos.org/noticias/como-funciona-checagem-tempo-real-aos-fatos-debates-entrevistas/";
export const AOS_FATOS_RSS = [
  "https://www.aosfatos.org/noticias/feed/",
  "https://www.aosfatos.org/feed/",
];
export const TERRA_YOUTUBE_LIVE = "https://www.youtube.com/watch?v=qC8If7jg6tc";

const SOURCE_ID = "terra_aos_fatos";
const SOURCE_NAME = "Terra / Aos Fatos";

function toItem(input: {
  url: string;
  title: string;
  summary: string;
  publishedAt?: string;
  forceKind?: ItemKind;
}): FeedItem {
  const text = `${input.title} ${input.summary}`;
  const detected = detectVerdict(text);
  const isAnnounce = input.url.includes("terra-e-aos-fatos-farao-checagem");
  const isMethod = input.url.includes("como-funciona-checagem-tempo-real");
  const kind: ItemKind =
    input.forceKind ??
    (isAnnounce || isMethod
      ? "news"
      : detected || looksLikeFactCheck(text) || /checamos|aos\s*fatos/i.test(text)
        ? "factcheck"
        : "news");

  return {
    id: `${SOURCE_ID}_${hashId([input.url, input.title])}`,
    kind,
    sourceId: SOURCE_ID,
    sourceName: SOURCE_NAME,
    sourceUrl: input.url,
    title: input.title,
    claim: input.title
      .replace(/é\s*(falso|verdadeiro|verdadeira|exagerado|exagerada)/gi, "")
      .replace(/não é bem assim/gi, "")
      .replace(/^[:\-–—\s]+/, "")
      .trim() || input.title,
    verdict: kind === "factcheck" ? detected?.verdict ?? "inconclusivo" : null,
    originalVerdictLabel: kind === "factcheck" ? detected?.label ?? null : null,
    summary: input.summary || input.title,
    candidate: inferCandidate(text),
    topic: isAnnounce || isMethod ? "metodologia" : inferTopic(text),
    publishedAt: input.publishedAt ?? new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
   
  };
}

function parseDate(value?: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(+d) ? undefined : d.toISOString();
}

function extractTerraLiveblog(html: string, pageUrl: string): FeedItem[] {
  const items: FeedItem[] = [];
  const seen = new Set<string>();
  const lineRe =
    /\b(ENGANOSO|SUBESTIMADO|SUPERESTIMADO|VERDADEIRO|FALSO|NÃO É BEM ASSIM|NAO E BEM ASSIM):\s*([^\n<]{18,280})/gi;
  const add = (label: string, body: string) => {
    const title = body
      .replace(/\s+/g, " ")
      .replace(/\s*Foto:\s*$/i, "")
      .replace(/\\+"/g, "")
      .replace(/[.,;:\s]+$/g, "")
      .trim();
    if (title.length < 18) return;
    const key = title.slice(0, 72);
    if (seen.has(key)) return;
    seen.add(key);
    items.push(
      toItem({
        url: `${pageUrl}#${hashId([title])}`,
        title,
        summary: `${label}: ${title}`.slice(0, 360),
        publishedAt: "2026-10-24T02:00:00.000Z",
        forceKind: "factcheck",
      }),
    );
  };
  let match: RegExpExecArray | null;
  while ((match = lineRe.exec(html))) {
    add(match[1], match[2]);
  }
  const headlines = html.matchAll(/"headline"\s*:\s*"([^"]+)"/g);
  for (const hit of headlines) {
    const raw = hit[1].replace(/\\u[\dA-Fa-f]{4}/g, (esc) =>
      String.fromCharCode(Number.parseInt(esc.slice(2), 16)),
    );
    const split = raw.match(
      /^(ENGANOSO|SUBESTIMADO|SUPERESTIMADO|VERDADEIRO|FALSO|NÃO É BEM ASSIM):\s*(.+)$/i,
    );
    if (split) add(split[1], split[2]);
  }
  return items;
}

function extractLiveChecks(html: string, pageUrl: string): FeedItem[] {
  const items: FeedItem[] = [];
  const headingRe =
    /<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi;
  let match: RegExpExecArray | null;
  while ((match = headingRe.exec(html))) {
    const title = stripHtml(match[1]);
    if (title.length < 24) continue;
    if (/em atualiza/i.test(title)) continue;
    if (!looksLikeFactCheck(title) && !detectVerdict(title)) continue;
    items.push(
      toItem({
        url: `${pageUrl}#${hashId([title])}`,
        title,
        summary: title,
        forceKind: "factcheck",
      }),
    );
  }

  const anchors = extractAnchors(html, (href) =>
    /aosfatos\.org\/noticias|terra\.com\.br\/noticias\/(checamos|eleicoes)/.test(
      href,
    ),
  );
  for (const anchor of anchors.slice(0, 30)) {
    items.push(
      toItem({
        url: anchor.href.startsWith("http")
          ? anchor.href
          : new URL(anchor.href, pageUrl).toString(),
        title: anchor.title,
        summary: anchor.title,
      }),
    );
  }
  return items;
}

export const terraAdapter: SourceAdapter = {
  id: SOURCE_ID,
  name: SOURCE_NAME,
  homepage: TERRA_CHECAMOS_URL,
  liveUrl: TERRA_LIVE_URL,
  priority: 1,
  pollMs: 30_000,

  async fetchLatest(): Promise<AdapterResult> {
    const fetchedAt = new Date().toISOString();
    const bag = new Map<string, FeedItem>();
    const errors: string[] = [];
    let anyOk = false;

    const announce = await fetchText(TERRA_ANNOUNCE_URL);
    if (announce.ok) {
      anyOk = true;
      bag.set(
        TERRA_ANNOUNCE_URL,
        toItem({
          url: TERRA_ANNOUNCE_URL,
          title:
            "Terra e Aos Fatos farão checagem em tempo real do debate final na Globo",
          summary:
            "Parceria publica checagens no portal Terra, WhatsApp, @terragora e live no YouTube com Tai Nalon (Aos Fatos). Comprova e Estadão Verifica entram na cobertura. Selos do Aos Fatos: VERDADEIRO, FALSO e NÃO É BEM ASSIM.",
          publishedAt: "2026-10-22T22:10:00.000Z",
          forceKind: "news",
        }),
      );
    } else {
      errors.push(`terra: ${announce.error}`);
      bag.set(
        TERRA_ANNOUNCE_URL,
        toItem({
          url: TERRA_ANNOUNCE_URL,
          title:
            "Terra e Aos Fatos farão checagem em tempo real do debate final na Globo",
          summary:
            "Anúncio oficial da parceria. Página não relida agora; URL preservada.",
          publishedAt: "2026-10-22T22:10:00.000Z",
          forceKind: "news",
        }),
      );
    }

    const terraLive = await fetchText(TERRA_LIVE_URL, 15000);
    if (terraLive.ok) {
      anyOk = true;
      for (const item of extractTerraLiveblog(terraLive.text, TERRA_LIVE_URL)) {
        bag.set(item.id, item);
      }
    } else {
      errors.push(`terra live: ${terraLive.error}`);
    }

    const live = await fetchText(AOS_FATOS_LIVE_URL, 15000);
    if (live.ok) {
      anyOk = true;
      for (const item of extractLiveChecks(live.text, AOS_FATOS_LIVE_URL)) {
        bag.set(item.id, item);
      }
      bag.set(
        AOS_FATOS_LIVE_URL,
        toItem({
          url: AOS_FATOS_LIVE_URL,
          title: "Checamos Flávio Bolsonaro e Lula no debate da Globo",
          summary:
            "Página viva do Aos Fatos. Checagens saem à medida que a apuração fecha. Transcrição via Escriba. Listas de Flávio e Lula em atualização durante o debate.",
          publishedAt: "2026-10-24T00:18:00.000Z",
          forceKind: "news",
        }),
      );
    } else {
      errors.push(`aos fatos live: ${live.error}`);
    }

    const method = await fetchText(AOS_FATOS_METHOD_URL);
    if (method.ok) {
      anyOk = true;
      bag.set(
        AOS_FATOS_METHOD_URL,
        toItem({
          url: AOS_FATOS_METHOD_URL,
          title:
            "Como funciona a checagem em tempo real do Aos Fatos em debates",
          summary:
            "Metodologia: transcrição Escriba, seleção do verificável, Busca Fatos, fontes primárias e revisão por ao menos dois editores. Selos: VERDADEIRO, NÃO É BEM ASSIM, FALSO.",
          publishedAt: "2026-10-22T16:26:00.000Z",
          forceKind: "news",
        }),
      );
    }

    const checamos = await fetchText(TERRA_CHECAMOS_URL);
    if (checamos.ok) {
      anyOk = true;
      for (const item of extractLiveChecks(checamos.text, TERRA_CHECAMOS_URL)) {
        if (!bag.has(item.id)) bag.set(item.id, item);
      }
    } else {
      errors.push(`terra checamos: ${checamos.error}`);
    }

    for (const feed of AOS_FATOS_RSS) {
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
      if (bag.size > 3) break;
    }

    return {
      items: [...bag.values()],
      status: {
        id: SOURCE_ID,
        name: SOURCE_NAME,
        homepage: TERRA_CHECAMOS_URL,
        liveUrl: TERRA_LIVE_URL,
        priority: 1,
        online: anyOk,
        lastSuccessAt: anyOk ? fetchedAt : null,
        lastError: anyOk ? null : errors[0] ?? "falha Terra/Aos Fatos",
        lastFetchedAt: fetchedAt,
        note: `Checagens no liveblog do Terra. Aos Fatos (aosfatos.org) devolveu 404 ao coletor. Live: ${TERRA_LIVE_URL}.`,
      },
    };
  },
};
