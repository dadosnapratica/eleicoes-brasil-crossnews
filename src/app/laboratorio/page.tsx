import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Laboratório · CrossNews — captura, cruzamento e índice",
  description:
    "Como o CrossNews captura checagens ao vivo, cruza as mesas e pondera o índice de verdade e mentira — com notebook Jupyter para o Google Colab.",
};

const COLAB = "https://colab.research.google.com/";
const NOTEBOOK = "/laboratorio/crossnews_captura_cruzamento.ipynb";
const DOCS = "/laboratorio/arquitetura.md";
const SPEC = "/laboratorio/spec/spec.md";
const SCHEMAS = "/laboratorio/schemas.md";
const GOVERNANCE = "/laboratorio/governanca-ia.md";

export default function LaboratorioPage() {
  return (
    <div className="relative mx-auto min-h-screen max-w-3xl px-4 pb-20 pt-8 sm:px-6">
      <div className="orb-stars pointer-events-none absolute inset-x-0 top-0 h-56" />
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--navy)]">
        Laboratório didático
      </p>
      <h1
        className="mt-2 text-4xl font-semibold tracking-tight text-[var(--navy)] sm:text-5xl"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Como o CrossNews lê o debate
      </h1>
      <p className="mt-3 text-base leading-relaxed text-[var(--navy-mid)] sm:text-lg">
        Guia para iniciantes e intermediários: captura em tempo quase real,
        cruzamento das mesas e ponderação do índice de verdade e mentira. A IA
        local entra só para agrupar texto — nunca para inventar selo.
      </p>

      <div
        id="colab"
        className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--line)] bg-white px-4 py-4"
      >
        <a
          href={COLAB}
          target="_blank"
          rel="noreferrer"
          className="rounded-full bg-[#f9ab00] px-4 py-2 text-sm font-semibold text-[#1f1f1f]"
        >
          Abrir no Google Colab
        </a>
        <a
          href={NOTEBOOK}
          download
          className="rounded-full border border-[var(--navy)] bg-[var(--navy)] px-4 py-2 text-sm font-semibold text-white"
        >
          Baixar notebook
        </a>
        <a
          href={DOCS}
          className="rounded-full border border-[var(--line)] px-4 py-2 text-sm text-[var(--navy)] hover:border-[var(--navy)]"
        >
          Texto completo
        </a>
        <a
          href={SPEC}
          className="rounded-full border border-[var(--gold)] bg-[#fff8d6] px-4 py-2 text-sm text-[var(--navy)] hover:border-[var(--navy)]"
        >
          Spec GitHub
        </a>
        <Link
          href="/"
          className="text-sm text-[var(--muted)] underline underline-offset-2 hover:text-[var(--navy)]"
        >
          Voltar ao painel
        </Link>
      </div>
      <p className="mt-2 text-xs text-[var(--muted)]">
        No Colab: <strong>Arquivo → Fazer upload do notebook</strong>. Os JSONs
        baixam sozinhos do site. Sem GPU, sem chave, sem repositório.
      </p>

      <section className="mt-8 rounded-2xl border border-[var(--line)] bg-white px-5 py-5">
        <h2 className="text-lg font-semibold text-[var(--navy)]">
          Documentação
        </h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-[var(--navy-mid)]">
          <li>
            <a href={DOCS} className="font-medium text-[var(--navy)] underline underline-offset-2">
              arquitetura.md
            </a>
            {" — "}
            guia didático: captura, cruzamento e índice
          </li>
          <li>
            <a href={SCHEMAS} className="font-medium text-[var(--navy)] underline underline-offset-2">
              schemas.md
            </a>
            {" — "}
            campos internos × JSON público
          </li>
          <li>
            <a href={GOVERNANCE} className="font-medium text-[var(--navy)] underline underline-offset-2">
              governanca-ia.md
            </a>
            {" — "}
            política da IA: versão de prompt/dados, guardrails, rastreio
          </li>
          <li>
            <a href="/laboratorio/spec/" className="font-medium text-[var(--navy)] underline underline-offset-2">
              spec/
            </a>
            {" — "}
            Spec Kit (spec.md, plan.md, agent-howto.md)
          </li>
          <li>
            <a href={NOTEBOOK} className="font-medium text-[var(--navy)] underline underline-offset-2">
              notebook Jupyter
            </a>
            {" — "}
            caderno; no Colab: Arquivo → Fazer upload do notebook
          </li>
        </ul>
      </section>

      <ol className="mt-10 space-y-10 text-[15px] leading-relaxed text-[var(--text)]">
        <li>
          <h2 className="text-xl font-semibold text-[var(--navy)]">
            1. O problema
          </h2>
          <p className="mt-2">
            Cada mesa publica no próprio site, com selo próprio. O eleitor
            teria de abrir quatro liveblogs ao mesmo tempo. O CrossNews{" "}
            <strong>não apura</strong> se o candidato falou a verdade. Ele
            captura o que as mesas já publicaram, agrupa a mesma fala e
            pondera os selos.
          </p>
        </li>

        <li>
          <h2 className="text-xl font-semibold text-[var(--navy)]">
            2. Captura em tempo quase real
          </h2>
          <p className="mt-2">
            Não há WebSocket público de checagens. Tempo real, aqui, é{" "}
            <strong>polling</strong>: o servidor pergunta de novo a cada 30 s;
            o navegador pede <code>/api/feed</code> a cada 10 s.
          </p>
          <Flow
            steps={[
              "Páginas / RSS / JSON",
              "Adaptador da mesa",
              "FeedItem",
              "Painel",
            ]}
          />
          <p className="mt-3">
            O Firecrawl entra na <em>véspera</em>, como binóculo. Os dumps em{" "}
            <code>.firecrawl/</code> mostram o envelope{" "}
            <code>markdown + metadata + rawHtml</code>. O UOL esconde a
            timeline em <code>&lt;script id=&quot;VUELAND_STATE&quot;&gt;</code>{" "}
            — por isso o HTML bruto importa. Em produção o adaptador baixa a
            URL direto. Se o site responde 403, a fonte fica OFF: nenhum card
            inventado.
          </p>
        </li>

        <li>
          <h2 className="text-xl font-semibold text-[var(--navy)]">
            3. Selo canônico
          </h2>
          <p className="mt-2">
            G1 escreve <code>#FAKE</code>. Aos Fatos escreve{" "}
            <code>Enganoso</code>. Folha escreve <code>exagerada</code>. Por
            dentro vira <code>falso</code> / <code>exagerado</code>. O cartão
            guarda o rótulo original. Regex ordenada em{" "}
            <code>verdict.ts</code> — hashtags primeiro, depois o vocabulário
            das outras mesas.
          </p>
        </li>

        <li>
          <h2 className="text-xl font-semibold text-[var(--navy)]">
            4. Cruzamento heurístico
          </h2>
          <p className="mt-2">
            “Bolsa Família de R$ 600” e “o auxílio foi a 600 reais” são a
            mesma afirmação. O motor rápido (determinístico):
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>normaliza (sem acento, sem pontuação)</li>
            <li>
              Jaccard ≥ 0,34 <em>ou</em> overlap ≥ 0,55
            </li>
            <li>
              <code>6 mil</code> = <code>6.000</code> = <code>seis mil</code>
            </li>
            <li>número só casa se o tema for o mesmo (obra ≠ internet)</li>
          </ul>
          <p className="mt-3">
            Consenso do grupo: fato + fake no mesmo cluster →{" "}
            <strong>DIVERGENTE</strong>. Só correção (impreciso / exagerado)
            sem um verdadeiro contrário → <strong>FAKE</strong>.
          </p>
        </li>

        <li>
          <h2 className="text-xl font-semibold text-[var(--navy)]">
            5. Índice de verdade e mentira
          </h2>
          <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--line)] bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--bg-elev)] text-[11px] uppercase tracking-wider text-[var(--navy)]">
                <tr>
                  <th className="px-3 py-2">Selo</th>
                  <th className="px-3 py-2">Peso</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-[var(--line)]">
                  <td className="px-3 py-2">verdadeiro</td>
                  <td className="px-3 py-2">1,0</td>
                </tr>
                <tr className="border-t border-[var(--line)]">
                  <td className="px-3 py-2">contexto / exagerado / impreciso</td>
                  <td className="px-3 py-2">0,5</td>
                </tr>
                <tr className="border-t border-[var(--line)]">
                  <td className="px-3 py-2">falso / insustentável</td>
                  <td className="px-3 py-2">0,0</td>
                </tr>
                <tr className="border-t border-[var(--line)]">
                  <td className="px-3 py-2">inconclusivo</td>
                  <td className="px-3 py-2">não entra</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3">
            Índice de verdade = média dos pesos × 100. Mentira = 100 −
            verdade. Sem checagem com peso, os dois ficam em{" "}
            <strong>zero</strong> — “nada a ponderar”, não “mentiu 0%”. Uma
            fala checada por três mesas conta três vezes.
          </p>
        </li>

        <li>
          <h2 className="text-xl font-semibold text-[var(--navy)]">
            6. IA local, não determinística
          </h2>
          <p className="mt-2">
            O segundo motor é um modelo no <strong>servidor</strong>. Ele
            recebe <code>{"{id, mesa, selo, afirmação}"}</code> e devolve
            grupos em JSON. Temperatura 0,1: pouco ruído, ainda assim duas
            rodadas podem juntar ou partir um caso-limite (“6 mil obras” ×
            “mais de seis mil obras paradas”).
          </p>
          <p className="mt-2">
            O modelo <strong>não cria veredito</strong>. O placar é
            recalculado pela função heurística. Se o processo cair, o painel
            permanece no consenso clássico. Host e porta nunca vão ao
            navegador — só o selo “Consenso Ollama”, o nome do modelo e a
            versão do prompt (`cross-v1`).
          </p>
        </li>

        <li>
          <h2 className="text-xl font-semibold text-[var(--navy)]">
            7. Schemas e proteção do backend
          </h2>
          <p className="mt-2">
            Os campos reais (
            <code>FeedItem</code>, <code>ClaimCluster</code>,{" "}
            <code>CandidateScore</code>, <code>SourceStatus</code>,{" "}
            <code>CrossingMeta</code>, <code>FeedResponse</code>) e as rotas{" "}
            <code>/api/feed</code>, <code>/api/sources</code>,{" "}
            <code>/api/refresh</code>, <code>/api/crossing</code> estão na{" "}
            <a href={SPEC} className="underline underline-offset-2">
              spec GitHub
            </a>
            . O JSON público passa por <code>sanitizePublicFeed</code> /{" "}
            <code>publicCrossing</code>: sem host interno, sem porta, sem URL
            do modelo. Env do cruzamento é só servidor. Após o cutoff, a
            captura vira arquivo e os POSTs respondem 410.
          </p>
          <p className="mt-2">
            Lista didática interno × público:{" "}
            <a href={SCHEMAS} className="underline underline-offset-2">
              schemas.md
            </a>
            . A IA é editor de agrupamento, com prompt versionado e
            guardrails nomeados:{" "}
            <a href={GOVERNANCE} className="underline underline-offset-2">
              governanca-ia.md
            </a>
            . Agentes de código implementam contra a spec — não contra este
            guia. O ensaio completo continua em{" "}
            <a href={DOCS} className="underline underline-offset-2">
              arquitetura.md
            </a>
            .
          </p>
        </li>
      </ol>

      <section className="mt-12 rounded-2xl border border-[var(--gold)]/40 bg-[#fff8d6] px-5 py-5">
        <h2 className="text-lg font-semibold text-[var(--navy)]">
          Abra o caderno agora
        </h2>
        <p className="mt-2 text-sm text-[var(--navy-mid)]">
          68 checagens reais da noite + dumps Firecrawl da véspera. Você
          recalcula o mesmo placar do painel e vê a IA simulada divergir entre
          sementes — sem inventar selo.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <a
            href={NOTEBOOK}
            download
            className="rounded-full bg-[var(--navy)] px-4 py-2 text-sm font-semibold text-white"
          >
            Baixar .ipynb
          </a>
          <a
            href={COLAB}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-[var(--navy)] px-4 py-2 text-sm font-semibold text-[var(--navy)]"
          >
            Abrir Google Colab
          </a>
        </div>
      </section>

      <p className="mt-10 text-sm text-[var(--muted)]">
        <Link href="/" className="underline underline-offset-2 hover:text-[var(--navy)]">
          ← Painel ao vivo
        </Link>
        {" · "}
        <a href={DOCS} className="underline underline-offset-2 hover:text-[var(--navy)]">
          Arquitetura completa
        </a>
        {" · "}
        <a href={SPEC} className="underline underline-offset-2 hover:text-[var(--navy)]">
          Spec
        </a>
        {" · "}
        <a href={SCHEMAS} className="underline underline-offset-2 hover:text-[var(--navy)]">
          Schemas
        </a>
        {" · "}
        <a href={GOVERNANCE} className="underline underline-offset-2 hover:text-[var(--navy)]">
          Governança da IA
        </a>
        {" · "}
        CrossNews não é produto oficial do TSE.
      </p>
    </div>
  );
}

function Flow({ steps }: { steps: string[] }) {
  return (
    <ol className="mt-4 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--navy)]">
      {steps.map((step, i) => (
        <li key={step} className="flex items-center gap-2">
          <span className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5">
            {step}
          </span>
          {i < steps.length - 1 ? (
            <span className="text-[var(--muted)]" aria-hidden>
              →
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
