"use client";

import { useEffect, useState } from "react";
import type { ArchiveMeta } from "@/lib/types";

const STORAGE_KEY = "crossnews.arquivo.modal.v1";

function formatBrasilia(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(+date)) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function OfflineModal({ archive }: { archive?: ArchiveMeta }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!archive?.offline) return;
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === "1") return;
    } catch {
      // private mode: still show once per mount
    }
    setOpen(true);
  }, [archive?.offline]);

  if (!archive?.offline || !open) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
    setOpen(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#122033]/45 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="offline-modal-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-[var(--line)] bg-white p-6 shadow-xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--navy)]">
          Arquivo · 2º turno
        </p>
        <h2
          id="offline-modal-title"
          className="mt-2 text-2xl font-semibold text-[var(--navy)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Captura em tempo real encerrada
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-[var(--navy-mid)]">
          As capturas em tempo real foram finalizadas. A seguir você verá as
          últimas estatísticas gravadas ao vivo.
        </p>
        <p className="mt-3 text-xs text-[var(--muted)]">
          Encerramento: 24/10/2026 12:00, horário de Brasília
          {archive.cutoffAt ? ` (${formatBrasilia(archive.cutoffAt)})` : ""}.
        </p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Foto da última estatística: {formatBrasilia(archive.snapshotAt)}
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="mt-5 rounded-full bg-[var(--navy)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--navy-mid)]"
        >
          Ver últimas estatísticas
        </button>
      </div>
    </div>
  );
}
