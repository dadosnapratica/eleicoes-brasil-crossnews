import type { CandidateId, Consensus, Verdict } from "./types";
import { CANDIDATE_LABEL, CONSENSUS_LABEL, VERDICT_LABEL } from "./types";

export function formatClock(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(+date)) return "—";
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const hour = String((date.getUTCHours() - 3 + 24) % 24).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${day}/${month} ${hour}:${minute}`;
}

export function formatRelative(iso: string): string {
  const delta = Date.now() - +new Date(iso);
  const min = Math.round(delta / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `há ${hours} h`;
  return formatClock(iso);
}

export function candidateLabel(id: CandidateId): string {
  return CANDIDATE_LABEL[id];
}

export function verdictLabel(verdict: Verdict): string {
  return VERDICT_LABEL[verdict];
}

export function consensusLabel(consensus: Consensus): string {
  return CONSENSUS_LABEL[consensus];
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
