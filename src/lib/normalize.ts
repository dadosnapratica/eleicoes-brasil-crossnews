const STOPWORDS = new Set([
  "a",
  "ao",
  "aos",
  "as",
  "ate",
  "com",
  "como",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "em",
  "era",
  "essa",
  "esse",
  "esta",
  "este",
  "foi",
  "ha",
  "isso",
  "isto",
  "ja",
  "mais",
  "mas",
  "na",
  "nao",
  "nas",
  "no",
  "nos",
  "o",
  "os",
  "ou",
  "para",
  "pela",
  "pelo",
  "por",
  "que",
  "se",
  "sem",
  "ser",
  "sua",
  "seu",
  "um",
  "uma",
  "e",
  "eh",
]);

export function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "");
}

export function normalizeText(value: string): string {
  return stripAccents(value)
    .toLowerCase()
    .replace(/[#@]/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

export function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const token of setA) {
    if (setB.has(token)) inter += 1;
  }
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function overlapRatio(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const token of setA) {
    if (setB.has(token)) inter += 1;
  }
  return inter / Math.min(setA.size, setB.size);
}

export function significantNumbers(text: string): Set<string> {
  let n = stripAccents(text).toLowerCase();
  n = n.replace(/\b(\d{1,3}(?:[.\s]\d{3})+)\b/g, (match) =>
    match.replace(/[.\s]/g, ""),
  );
  n = n.replace(/\b(\d+),(\d+)\s*mil\b/g, (_, whole: string, frac: string) =>
    String(Math.round(Number(`${whole}.${frac}`) * 1000)),
  );
  n = n.replace(/\b(\d+),(\d+)\s*mil\b/g, (_, whole: string, dec: string) =>
    String(Math.round(Number(`${whole}.${dec}`) * 1000)),
  );
  n = n.replace(/\b(\d+)\s*mil\b/g, (_, value: string) =>
    String(Number(value) * 1000),
  );
  const out = new Set<string>();
  for (const match of n.match(/\d{3,}/g) ?? []) {
    const value = String(Number(match));
    if (value !== "0") out.add(value);
  }
  return out;
}

export function sameNumericClaim(a: string, b: string): boolean {
  const na = significantNumbers(a);
  const nb = significantNumbers(b);
  let shared = 0;
  for (const value of na) {
    if (nb.has(value)) shared += 1;
  }
  if (shared === 0) return false;
  const topic =
    /\b(obra|bolsa|fome|internet|pedagio|saneamento|divida|chocolate|rodovia|br319)\b/;
  return topic.test(normalizeText(a)) && topic.test(normalizeText(b));
}

export function similarClaims(a: string, b: string): boolean {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.length < 3 || tb.length < 3) {
    return normalizeText(a) === normalizeText(b);
  }
  const jac = jaccard(ta, tb);
  const overlap = overlapRatio(ta, tb);
  return jac >= 0.34 || overlap >= 0.55;
}

export function inferCandidate(text: string): import("./types").CandidateId {
  const n = normalizeText(text);
  const hasLula =
    /\blula\b/.test(n) ||
    /\bluiz inacio\b/.test(n) ||
    /\bluiz inacio lula\b/.test(n);
  const hasFlavio =
    /\bflavio\b/.test(n) ||
    /\bflavio bolsonaro\b/.test(n) ||
    (/\bbolsonaro\b/.test(n) && !/\bjair\b/.test(n));

  if (hasLula && hasFlavio) return "ambos";
  if (hasLula) return "lula";
  if (hasFlavio) return "flavio_bolsonaro";
  return "nenhum";
}

const OTHER_RACE =
  /\b(haddad|tarcisio|zema|caiado|governo de|governo do|distrito federal|senado|camara|prefeito|sabatina|debate da band|entrevista de lula na tv globo)\b/;

const SERVICE_PAGE =
  /\b(enviar sugestoes|canal no whatsapp|historico do servico|conheca o historico|entenda como funcionam)\b/;

const LIVEBLOG_URL =
  /ao-vivo\/2026\/10\/23|aovivo\.folha\.uol\.com\.br\/poder\/2026\/10\/23|checamos-flavio-bolsonaro-lula-debate-globo|radar-da-eleicao-lula-e-flavio|veja-o-que-e-fato-ou-fake-nas-falas-de-flavio-bolsonaro-e-lula-no-debate-da-globo-no-2o-turno|agencialupa\.org\/checagem\/2026\/10\/23\/ao-vivo-checagem|debate-da-globo-acompanhe-a-checagem-ao-vivo|debate-tv-globo-checagem-tempo-real-ao-vivo/;

const DEBATE_NIGHT_START = Date.parse("2026-10-23T00:00:00-03:00");
const DEBATE_NIGHT_END = Date.parse("2026-10-24T12:00:00-03:00");

export function isDebateScoped(text: string): boolean {
  const n = normalizeText(text);
  if (OTHER_RACE.test(n) || SERVICE_PAGE.test(n)) return false;
  const tonightDebate =
    /\b(debate.{0,60}globo|globo.{0,60}debate|debate presidencial|debate final|ultimo debate|2o turno da globo)\b/.test(
      n,
    );
  const candidates =
    /\b(lula|flavio|luiz inacio)\b/.test(n) ||
    (/\bbolsonaro\b/.test(n) && !/\bjair\b/.test(n));
  return tonightDebate && candidates;
}

export function isLiveblogUrl(url: string): boolean {
  return LIVEBLOG_URL.test(url);
}

export function isDebateNightStamp(iso: string | undefined): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return t >= DEBATE_NIGHT_START && t <= DEBATE_NIGHT_END;
}

export function inferTopic(text: string): string {
  const n = normalizeText(text);
  const rules: Array<[string, RegExp]> = [
    ["economia", /inflacao|desemprego|pib|economia|juros|dolar|renda|salario|fiscal|divida|crescimento/],
    ["saude", /saude|sus|vacina|hospital|medico|farmacia|covid/],
    ["seguranca", /seguranca|homicidio|crime|policia|violencia|milicia|trafico|fuzil/],
    ["meio ambiente", /amazonia|desmatamento|clima|ambiente|garimpo|pantanal|queimada/],
    ["programas sociais", /bolsa familia|auxilio|minha casa|cadunico|beneficio|cadastro unico/],
    ["educacao", /educacao|escola|universidade|enem|alfabetizacao|mec/],
    ["corrupcao", /corrupcao|lava jato|propina|desvio|mensalao/],
    ["debate", /debate|globo|regras|bloco|plateia|estudio/],
  ];
  for (const [topic, re] of rules) {
    if (re.test(n)) return topic;
  }
  return "politica";
}

export function hashId(parts: string[]): string {
  const input = parts.join("|");
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#8230;/g, "...")
    .replace(/&hellip;/g, "...")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
