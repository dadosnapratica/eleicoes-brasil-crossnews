import type { CandidateId } from "@/lib/types";
import { TSE_CANDIDATES } from "@/lib/candidates";
import { initials } from "@/lib/format";

export function CandidatePhoto({
  candidate,
  size = 56,
}: {
  candidate: CandidateId;
  size?: number;
}) {
  const photo = TSE_CANDIDATES[candidate];
  const label = photo?.name ?? "Candidato";
  return (
    <span
      className="relative inline-flex shrink-0 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--bg-elev)] shadow-sm"
      style={{ width: size, height: size }}
    >
      {photo ? (
        // Official TSE / DivulgaCand urna portrait (Eleições 2026).
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo.src}
          alt={`Foto oficial de urna de ${photo.fullName} — TSE / DivulgaCand`}
          width={size}
          height={size}
          className="h-full w-full object-cover object-top"
        />
      ) : (
        <span className="grid h-full w-full place-items-center text-sm font-semibold text-[var(--navy)]">
          {initials(label)}
        </span>
      )}
    </span>
  );
}
