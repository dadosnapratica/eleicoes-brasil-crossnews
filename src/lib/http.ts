const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 CrossNews/1.0";

export async function fetchText(
  url: string,
  timeoutMs = 12000,
): Promise<{ ok: true; text: string; contentType: string } | { ok: false; error: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        "Cache-Control": "no-cache",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const text = await res.text();
    return {
      ok: true,
      text,
      contentType: res.headers.get("content-type") ?? "",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "falha de rede";
    return { ok: false, error: message };
  } finally {
    clearTimeout(timer);
  }
}

export function extractAnchors(
  html: string,
  hrefTest: (href: string) => boolean,
): Array<{ href: string; title: string }> {
  const out: Array<{ href: string; title: string }> = [];
  const seen = new Set<string>();
  const re = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const href = match[1].split("?")[0];
    if (!hrefTest(href) || seen.has(href)) continue;
    const title = match[2]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (title.length < 18) continue;
    seen.add(href);
    out.push({ href, title });
  }
  return out;
}

export function parseRssItems(xml: string): Array<{
  title: string;
  link: string;
  description: string;
  pubDate: string;
}> {
  const items: Array<{
    title: string;
    link: string;
    description: string;
    pubDate: string;
  }> = [];
  const blocks = xml.split(/<item[\s>]/i).slice(1);
  for (const block of blocks) {
    const chunk = block.split(/<\/item>/i)[0];
    const title = inner(chunk, "title");
    const link = inner(chunk, "link") || inner(chunk, "guid");
    const description = inner(chunk, "description") || inner(chunk, "content:encoded");
    const pubDate = inner(chunk, "pubDate") || inner(chunk, "dc:date");
    if (title && link) {
      items.push({ title, link, description, pubDate });
    }
  }
  return items;
}

function inner(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const match = xml.match(re);
  if (!match) return "";
  return match[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
