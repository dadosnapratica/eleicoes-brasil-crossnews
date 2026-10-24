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

export const UOL_LIVE_URL =
  "https://noticias.uol.com.br/ao-vivo/2026/10/23/radar-da-eleicao-lula-e-flavio-debatem-na-globo-uol-confere-faz-checagem.htm";

export const UOL_CONFERE_URL = "https://noticias.uol.com.br/confere/";
export const UOL_CONFERE_ELEICOES_URL =
  "https://noticias.uol.com.br/confere/uol-confere-nas-eleicoes/";

const SOURCE_ID = "uol_confere";
const SOURCE_NAME = "UOL Confere / Radar da Eleição";

interface UolCard {
  id?: string;
  date?: number;
  created?: number;
  url?: string;
  title?: string;
  content?: string;
  type?: string;
  author?: { name?: string };
}

function extractVuelandState(html: string): unknown | null {
  const match = html.match(
    /<script[^>]*id=["']VUELAND_STATE["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function collectTimeline(state: unknown): UolCard[] {
  if (!state || typeof state !== "object") return [];
  const root = state as Record<string, unknown>;
  const live = (root.live ??
    (root.content as Record<string, unknown> | undefined)?.live) as
    | Record<string, unknown>
    | undefined;

  const timeline = live?.timeline;
  if (Array.isArray(timeline)) return timeline as UolCard[];

  const found: UolCard[] = [];
  const walk = (value: unknown, depth: number) => {
    if (!value || depth > 6) return;
    if (Array.isArray(value)) {
      if (
        value.length > 0 &&
        typeof value[0] === "object" &&
        value[0] &&
        "id" in (value[0] as object) &&
        String((value[0] as UolCard).id ?? "").startsWith("card_")
      ) {
        found.push(...(value as UolCard[]));
        return;
      }
      value.forEach((item) => walk(item, depth + 1));
      return;
    }
    if (typeof value === "object") {
      for (const child of Object.values(value as Record<string, unknown>)) {
        walk(child, depth + 1);
      }
    }
  };
  walk(state, 0);
  return found;
}

function classifyUol(title: string, content: string, author: string): ItemKind {
  const blob = `${title} ${content} ${author}`;
  const nAuthor = author.toLowerCase();
  if (nAuthor.includes("confere") || nAuthor.includes("checagem")) {
    return "factcheck";
  }
  if (detectVerdict(blob) && looksLikeFactCheck(blob)) return "factcheck";
  if (
    /\buol confere\b/i.test(blob) &&
    detectVerdict(blob)
  ) {
    return "factcheck";
  }
  if (
    /\b(é #|é fato|é fake|é falso|é verdadeiro|é exagerado|é impreciso)\b/i.test(
      blob,
    )
  ) {
    return "factcheck";
  }
  return "news";
}

function cardToItem(card: UolCard): FeedItem | null {
  const title = (card.title ?? "").trim();
  const content = stripHtml(card.content ?? "").trim();
  if (!title && !content) return null;
  if ((card.type ?? "text") === "ad") return null;

  const text = `${title} ${content}`;
  const kind = classifyUol(title, content, card.author?.name ?? "");
  const detected = detectVerdict(text);
  const ts = card.date || card.created;
  const publishedAt = ts ? new Date(ts).toISOString() : new Date().toISOString();
  const url = (card.url ?? UOL_LIVE_URL).replace("http://", "https://");
  const quoted = content.match(
    /(?:FL[AÁ]VIO|LULA)\s*:\s*[“"]([^”"]{16,})[”"]/i,
  );

  return {
    id: `uol_${card.id ?? hashId([url, title])}`,
    kind,
    sourceId: SOURCE_ID,
    sourceName: kind === "factcheck" ? "UOL Confere" : "UOL Radar da Eleição",
    sourceUrl: url,
    title: title || content.slice(0, 120),
    claim: quoted?.[1]?.trim() || title || content.slice(0, 180),
    verdict: kind === "factcheck" ? detected?.verdict ?? "inconclusivo" : null,
    originalVerdictLabel: kind === "factcheck" ? detected?.label ?? null : null,
    summary: content.slice(0, 420) || title,
    candidate: inferCandidate(text),
    topic: inferTopic(text),
    publishedAt,
    fetchedAt: new Date().toISOString(),
   
  };
}

function listingToItems(html: string, pageUrl: string): FeedItem[] {
  const anchors = extractAnchors(html, (href) =>
    /uol\.com\.br\/(confere|ao-vivo|eleicoes|politica)/.test(href),
  );
  return anchors.slice(0, 20).map((anchor) => {
    const text = anchor.title;
    const kind = classifyUol(text, "", "");
    const detected = detectVerdict(text);
    return {
      id: `uol_list_${hashId([anchor.href])}`,
      kind,
      sourceId: SOURCE_ID,
      sourceName: kind === "factcheck" ? "UOL Confere" : "UOL Radar da Eleição",
      sourceUrl: anchor.href.startsWith("http")
        ? anchor.href
        : new URL(anchor.href, pageUrl).toString(),
      title: text,
      claim: text,
      verdict: kind === "factcheck" ? detected?.verdict ?? "inconclusivo" : null,
      originalVerdictLabel: kind === "factcheck" ? detected?.label ?? null : null,
      summary: text,
      candidate: inferCandidate(text),
      topic: inferTopic(text),
      publishedAt: new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
     
    } satisfies FeedItem;
  });
}

export const uolAdapter: SourceAdapter = {
  id: SOURCE_ID,
  name: SOURCE_NAME,
  homepage: UOL_CONFERE_URL,
  liveUrl: UOL_LIVE_URL,
  priority: 1,
  pollMs: 20_000,

  async fetchLatest(): Promise<AdapterResult> {
    const fetchedAt = new Date().toISOString();
    const items = new Map<string, FeedItem>();
    const errors: string[] = [];
    let anyOk = false;
    let channel: string | null = null;

    const live = await fetchText(UOL_LIVE_URL, 15000);
    if (live.ok) {
      anyOk = true;
      const state = extractVuelandState(live.text);
      if (state && typeof state === "object") {
        const root = state as Record<string, unknown>;
        const liveNode = (root.live ??
          (root.content as Record<string, unknown> | undefined)?.live) as
          | Record<string, unknown>
          | undefined;
        if (typeof liveNode?.channel === "string") {
          channel = liveNode.channel;
        }
      }
      const timeline = collectTimeline(state);
      for (const card of timeline) {
        const item = cardToItem(card);
        if (item) items.set(item.id, item);
      }
      if (timeline.length === 0) {
        for (const item of listingToItems(live.text, UOL_LIVE_URL)) {
          items.set(item.id, item);
        }
      }
    } else {
      errors.push(`live: ${live.error}`);
    }

    if (channel) {
      const feedUrls = [
        `https://rtlive.uol.com/${channel}`,
        `https://rtlive.uol.com/timeline/${channel}`,
        `https://rtlive.uol.com/feed/${channel}`,
      ];
      for (const url of feedUrls) {
        const extra = await fetchText(url, 8000);
        if (!extra.ok) continue;
        try {
          const json = JSON.parse(extra.text) as unknown;
          const cards = collectTimeline(json);
          for (const card of cards) {
            const item = cardToItem(card);
            if (item) items.set(item.id, item);
          }
          if (cards.length) break;
        } catch {
          // not JSON — ignore
        }
      }
    }

    for (const pageUrl of [UOL_CONFERE_ELEICOES_URL, UOL_CONFERE_URL]) {
      const page = await fetchText(pageUrl);
      if (!page.ok) {
        errors.push(`${pageUrl}: ${page.error}`);
        continue;
      }
      anyOk = true;
      for (const item of listingToItems(page.text, pageUrl)) {
        if (!items.has(item.id)) items.set(item.id, item);
      }
    }

    return {
      items: [...items.values()],
      status: {
        id: SOURCE_ID,
        name: SOURCE_NAME,
        homepage: UOL_CONFERE_URL,
        liveUrl: UOL_LIVE_URL,
        priority: 1,
        online: anyOk,
        lastSuccessAt: anyOk ? fetchedAt : null,
        lastError: anyOk ? null : errors[0] ?? "falha ao coletar UOL",
        lastFetchedAt: fetchedAt,
        note: channel
          ? `Liveblog Jupiter (canal ${channel}). Só entram no painel vereditos do UOL Confere sobre o debate.`
          : "Liveblog Radar da Eleição. Só entram no painel vereditos do UOL Confere sobre o debate.",
      },
    };
  },
};
