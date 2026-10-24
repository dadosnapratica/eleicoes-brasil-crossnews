import type { Consensus, Verdict } from "@/lib/types";
import { consensusLabel, verdictLabel } from "@/lib/format";

export function VerdictChip({
  verdict,
  original,
}: {
  verdict: Verdict;
  original?: string | null;
}) {
  return (
    <span
      className={`verdict-${verdict} inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide`}
    >
      {original || verdictLabel(verdict)}
    </span>
  );
}

export function ConsensusBadge({ consensus }: { consensus: Consensus }) {
  return (
    <span
      className={`verdict-${consensus} inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-bold tracking-[0.14em]`}
    >
      {consensusLabel(consensus)}
    </span>
  );
}
