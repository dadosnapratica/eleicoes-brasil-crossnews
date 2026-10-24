# Implementation Plan: CrossNews (living spec)

**Branch**: `000-crossnews-core` | **Date**: 2026-10-24 | **Spec**: [spec.md](./spec.md)

**Input**: Aplicação já existente. Este plano descreve a arquitetura **como está**, para agentes implementarem mudanças contra a spec — não um greenfield.

Ensaio didático (não duplicar): `docs/arquitetura.md` · [`/laboratorio/arquitetura.md`](/laboratorio/arquitetura.md).

---

## Summary

Next.js App Router (v16) no processo `origin-app`. Adaptadores baixam as mesas, normalizam `FeedItem`, clusterizam (heurística imediata + modelo assíncrono em `llm-internal`) e servem `FeedResponse` sanitizado. O público chega só por `tunnel-edge`. Sem banco, sem auth, sem `NEXT_PUBLIC_` para URL interna.

```text
mesas (HTTPS público)
        ↓  fetchText (servidor, cache: no-store)
   SourceAdapter.fetchLatest → AdapterResult
        ↓  collectLive
   clusterFactChecks  ──►  scores
        ↓ (async, se llm-internal)
   refineClustersWithOllama
        ↓
   store (memória) → sanitizePublicFeed → GET /api/feed
        ↓
   Dashboard (client, poll 10 s)
        ↓
   tunnel-edge → eleitor
```

Dois relógios: ingestão 30 s no servidor; poll 10 s no navegador.

---

## Technical Context

| Item | Valor real |
| --- | --- |
| Linguagem | TypeScript 5 |
| App | Next.js 16.4.3 App Router · React 19.3.0 |
| Estilo | Tailwind CSS 4 (navy/gold civic, `src/app/globals.css`) |
| Persistência | Memória (`src/lib/store.ts`) + `data/offline-snapshot.json` |
| Auth | Nenhuma |
| Testes | Sem suíte automatizada na v1 |
| Target | `origin-app` atrás de `tunnel-edge` |
| LLM | Opcional, só servidor, `llm-internal` |

Route Handlers usam a Web API `Response.json` (docs: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`). `dynamic = "force-dynamic"` impede cache estático.

---

## Project Structure

```text
src/
  app/
    page.tsx                 home → Dashboard (force-dynamic)
    laboratorio/page.tsx     guia + links para spec/notebook
    layout.tsx               fontes + GA4 opcional
    api/feed|sources|refresh|crossing/route.ts
  lib/
    types.ts                 schemas + publicCrossing + SCHEMA_VERSION
    ai-governance.ts         PROMPT_VERSION, prompts, guardrails nomeados
    adapters/                um arquivo por mesa + types.ts + index.ts
    http.ts                  fetchText / RSS / âncoras
    verdict.ts               selo canônico + pesos
    normalize.ts             Jaccard, números, candidato, tema
    cluster.ts               grupos heurísticos
    score.ts                 índices
    ollama-crossing.ts       IA local (server-only; usa ai-governance)
    ingest.ts                orquestra
    store.ts                 memória
    server-env.ts            env sem NEXT_PUBLIC interno
    offline.ts               cutoff + sanitizePublicFeed
    offline-http.ts          410
    ga.ts                    valida G-…
  components/Dashboard.tsx   UI do painel
docs/arquitetura.md          ensaio de ensino
docs/schemas.md              interno × público
docs/governanca-ia.md        política da IA (versão, guardrail, rastro)
.github/spec/                esta árvore (contrato para agentes)
public/laboratorio/          cópias públicas (md, ipynb, JSON, spec)
notebooks/                   laboratório Jupyter
data/                        snapshot/lock (não commitar segredo)
```

---

## Architecture notes (para implementar, não para republicar o ensaio)

1. **Adaptador = fronteira.** O resto do sistema não sabe se veio RSS, HTML ou `#VUELAND_STATE`. Novo adaptador = arquivo em `src/lib/adapters/` + registro em `index.ts`.
2. **Heurística primeiro.** `runIngest` sempre escreve clusters de `clusterFactChecks` (salvo reuso de cruzamento `ready`/`ollama` com a mesma `signature`).
3. **IA depois, sem bloquear.** `scheduleCrossing` / `requestCrossing` não esperam o modelo. Lotes de até 12 itens, concorrência 2, separados por candidato.
4. **Placar heurístico.** Mesmo quando o modelo agrupa, `guardHeuristicScore` / `clustersFromGroups` + `scoreCandidates` recalculam números. `guardForceDivergente`: verdadeiro + selo negativo no mesmo grupo força `divergente`. O modelo não escreve `item.verdict` (`guardNoInventedVerdict`). Prompt e parâmetros vivem em `ai-governance.ts` (`PROMPT_VERSION`).
5. **Filtro da noite** em `collectLive`: título ≥ 20, sem metodologia, liveblog só `factcheck`, senão precisa `isDebateScoped` e timestamp da noite.
6. **Arquivo.** `shouldStopLiveCapture` corta ingestão, loop, crossing e POSTs mutáveis.

---

## Libraries (só o que existe)

Inventariadas em `package.json` e imports reais de `src/`. Não listar biblioteca que o app não usa (sem Firecrawl SDK, sem client Ollama, sem ORM, sem axios).

### Runtime (`dependencies`)

| Pacote | Versão | Por que existe neste app |
| --- | --- | --- |
| `next` | 16.4.3 | App Router, Route Handlers, `Metadata`, `next/font/google`, `next/link`, `dynamic = "force-dynamic"`, `runtime = "nodejs"`. |
| `react` | 19.3.0 | Client Components (`Dashboard`, `OfflineModal`): estado, `useEffect` de poll, UI. |
| `react-dom` | 19.3.0 | Peer obrigatório do Next/React para hidratar a home. |
| `@next/third-parties` | ^16.4.3 | `GoogleAnalytics` em `layout.tsx`, só se `NEXT_PUBLIC_GA_MEASUREMENT_ID` for um `G-…` válido. |

### Tooling (`devDependencies`)

| Pacote | Versão | Por que existe neste app |
| --- | --- | --- |
| `typescript` | ^5 | Tipos canônicos em `src/lib/types.ts`; a spec é derivada deles. |
| `tailwindcss` | ^4 | Tokens civic (`--navy`, `--gold`) em `globals.css`. |
| `@tailwindcss/turbopack` | ^4 | Loader CSS no `next.config.ts` (`turbopack.rules`). |
| `eslint` + `eslint-config-next` | ^9 / 16.4.3 | Lint do App Router. |
| `@types/node` | ^20 | `node:fs`, `node:path`, `node:child_process`. |
| `@types/react` + `@types/react-dom` | ^19 | TSX. |

### Stdlib Node (server-only — não são npm)

| Módulo | Onde | Por que |
| --- | --- | --- |
| `node:fs` (`existsSync`, `readFileSync`) | `server-env.ts`, `offline.ts` | Ler env e o snapshot/lock sem expor ao cliente. |
| `node:path` (`resolve`) | idem | Caminhos a partir de `process.cwd()`. |
| `node:child_process` (`execFile`) | `ollama-crossing.ts` | `curl` até `llm-internal`. Evita que um `fetch` de client bundle carregue o host. Binário: `/usr/bin/curl`. |

### Next built-ins usados

- `next/font/google`: Geist, Geist Mono, Newsreader (display).
- `next/link`: navegação home ↔ laboratório.
- `Metadata` em `layout.tsx` e `laboratorio/page.tsx`.

Não há `next/image` de remoto, não há middleware, não há Server Actions no código atual.

---

## Security / deploy constraints (para o agente)

- Implementar → `npm run build` se o compile puder quebrar → publicar `src` + docs/spec/public/README no `origin-app`. **Não** rsync `.env*`. **Não** apagar scripts de start nem plists de serviço.
- No `origin-app`: `npm run build` e reiniciar o serviço do processo.
- Confirmar no hostname público (túnel), nunca na origem.
- Cruzamento no badge: «Consenso Ollama» + modelo. Nunca URL.

Detalhe normativo: [spec.md § Security](./spec.md#security--como-o-backend-é-protegido).

---

## Constitution Check

Antes de mergear código que altere comportamento:

- [ ] Nenhum host/IP/porta interno em cliente, JSON, HTML, README, UI.
- [ ] Env interna sem `NEXT_PUBLIC_`.
- [ ] Saída de feed passa por `sanitizePublicFeed`.
- [ ] Sem card inventado quando a mesa falha.
- [ ] IA não escreve `verdict`.
- [ ] Spec e `types.ts` ainda batem (atualizar `.github/spec/` + cópia em `public/laboratorio/spec/`).
