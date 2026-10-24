import type { Verdict } from "./types";
import { normalizeText } from "./normalize";

interface VerdictMatch {
  verdict: Verdict;
  label: string;
}

const RULES: Array<{ re: RegExp; verdict: Verdict; label: string }> = [
  { re: /#\s*fato\b|(?:^|[\s.,;:!?])e fato\b|\bfato\b.*checag|classificad[oa] como fato|selo fato|veredito fato/, verdict: "verdadeiro", label: "#FATO" },
  { re: /#\s*fake\b|(?:^|[\s.,;:!?])e fake\b|(?:^|[\s.,;:!?])e falso\b|\bfake\b.*checag|classificad[oa] como fake|selo fake/, verdict: "falso", label: "#FAKE" },
  { re: /nao\s*e\s*bem\s*assim|#\s*naoebemassim|#\s*nãoébémassim/, verdict: "contexto", label: "#NÃOÉBEMASSIM" },
  { re: /\bsubestimado\b/, verdict: "impreciso", label: "Subestimado" },
  { re: /\bsuperestimado\b/, verdict: "impreciso", label: "Superestimado" },
  { re: /\benganoso\b/, verdict: "falso", label: "Enganoso" },
  { re: /\bverdadeiro\b|\be verdade\b/, verdict: "verdadeiro", label: "Verdadeiro" },
  { re: /\binsustentavel\b/, verdict: "insustentavel", label: "Insustentável" },
  { re: /\bfalso\b|\bfake news\b/, verdict: "falso", label: "Falso" },
  { re: /\bexagerado\b/, verdict: "exagerado", label: "Exagerado" },
  { re: /\bimpreciso\b|\bdistorcido\b/, verdict: "impreciso", label: "Impreciso" },
  { re: /falta contexto|falta de contexto|fora de contexto|sem contexto|fora do contexto/, verdict: "contexto", label: "Falta contexto" },
  { re: /\binconclusivo\b|\bsem comprovacao\b|\bnao comprovado\b/, verdict: "inconclusivo", label: "Inconclusivo" },
];

export function detectVerdict(text: string): VerdictMatch | null {
  const n = normalizeText(text);
  const raw = text.toLowerCase();

  if (/#\s*fato\b/i.test(text) || raw.includes("#fato")) {
    return { verdict: "verdadeiro", label: "#FATO" };
  }
  if (/#\s*fake\b/i.test(text) || raw.includes("#fake")) {
    return { verdict: "falso", label: "#FAKE" };
  }
  if (/n[aã]o\s*é\s*bem\s*assim/i.test(text) || /naoebemassim/i.test(n)) {
    return { verdict: "contexto", label: "#NÃOÉBEMASSIM" };
  }

  for (const rule of RULES) {
    if (rule.re.test(n)) {
      return { verdict: rule.verdict, label: rule.label };
    }
  }

  return detectCorrectionVerdict(n);
}

/** Live-desk corrections that never print a classic selo (UOL Confere etc.). */
function detectCorrectionVerdict(n: string): VerdictMatch | null {
  const fromDesk =
    /\b(uol confere|fato ou fake|aos fatos|agencia lupa|estadao verifica|comprova|checagem|checamos)\b/.test(
      n,
    );
  if (!fromDesk) return null;

  if (/\bdado atualizado\b/.test(n)) {
    return { verdict: "impreciso", label: "Dado atualizado" };
  }
  if (
    /ao contrario do que/.test(n) ||
    /\bdesmente\b/.test(n) ||
    /\bnao e o que\b/.test(n)
  ) {
    return { verdict: "falso", label: "Ao contrário" };
  }
  if (/\be nao \d/.test(n) || /\bnao \d[\d\s]*\b/.test(n)) {
    return { verdict: "impreciso", label: "Dado atualizado" };
  }
  return null;
}

export function verdictWeight(verdict: Verdict): number | null {
  switch (verdict) {
    case "verdadeiro":
      return 1;
    case "contexto":
    case "exagerado":
    case "impreciso":
      return 0.5;
    case "falso":
    case "insustentavel":
      return 0;
    case "inconclusivo":
      return null;
  }
}

export function isPositive(verdict: Verdict): boolean {
  return verdict === "verdadeiro";
}

export function isNegative(verdict: Verdict): boolean {
  return verdict === "falso" || verdict === "insustentavel";
}

export function looksLikeFactCheck(text: string): boolean {
  const n = normalizeText(text);
  if (detectVerdict(text)) return true;
  return (
    /\b(fato ou fake|uol confere|aos fatos|agencia lupa|folha|terra|estadao verifica|comprova|afp|checamos|checagem|checou|verifica|desinformacao|e #|selo)\b/.test(
      n,
    ) &&
    /\b(fato|fake|falso|verdadeiro|exagerado|impreciso|contexto|insustentavel|dado atualizado)\b/.test(
      n,
    )
  );
}
