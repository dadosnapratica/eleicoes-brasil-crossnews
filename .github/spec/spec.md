# Feature Specification: CrossNews (living spec)

**Feature Branch**: `000-crossnews-core`  
**Created**: 2026-10-24  
**Status**: Living  
**Input**: Extraído do código em produção (`src/lib/types.ts`, `src/lib/ai-governance.ts`, `src/lib/adapters/types.ts`, `src/app/api/*`, `src/lib/offline.ts`, `src/lib/server-env.ts`, `src/lib/ollama-crossing.ts`, `.env.example`, dumps de ensino).  
**Não inventar campos.** Se o TypeScript e este arquivo divergirem, o TypeScript vence — atualize a spec.

Painel jornalístico **não partidário** que cruza checagens do debate presidencial de 2º turno da Rede Globo (Flávio Bolsonaro × Lula, 23/10/2026). O CrossNews **não apura** se o candidato falou a verdade: só agrega o que as mesas já publicaram, com atribuição e link.

Ensino paralelo (não duplicar aqui): `docs/arquitetura.md` · `docs/schemas.md` · `docs/governanca-ia.md` · página [`/laboratorio`](/laboratorio) · texto [`/laboratorio/arquitetura.md`](/laboratorio/arquitetura.md) · `README.md`.  
Como manter esta árvore: [agent-howto.md](./agent-howto.md). Arquitetura e bibliotecas: [plan.md](./plan.md).

---

## Constitution (princípios que a spec não pode violar)

- **C-001** Sem lote demo, sem card inventado. Fonte que falha fica `OFF`.
- **C-002** A IA local **agrupa** afirmações; **não cria** veredito, número nem fonte.
- **C-003** Superfície pública = `tunnel-edge` apenas. Origem (`origin-app`) e modelo (`llm-internal`) nunca entram em JS, JSON, HTML, README, badge ou DNS público.
- **C-004** Host/URL internos só em env **server-only** (`OLLAMA_HOST`, `OLLAMA_MODEL`). Nunca `NEXT_PUBLIC_*` para isso. Badge público: «Consenso Ollama» + nome do modelo.
- **C-005** Toda resposta de feed passa por `sanitizePublicFeed` / `publicCrossing` antes de sair.
- **C-006** `Cache-Control: no-store, max-age=0` nas rotas de API. `export const dynamic = "force-dynamic"`.
- **C-007** Após o cutoff (ou `OFFLINE_MODE` / `data/offline.lock`), captura e cruzamento param; o painel vira arquivo.

---

## User Scenarios & Testing

### User Story 1 — Ler o cruzamento das mesas (Priority: P1)

O eleitor abre a home e vê cada afirmação uma vez, com o selo de cada mesa lado a lado, consenso FATO / FAKE / DIVERGENTE / INCONCLUSIVO, e os índices de verdade e mentira dos dois candidatos.

**Why this priority**: É o produto.

**Independent Test**: `GET /api/feed` devolve `FeedResponse` sanitizado; a home (`Dashboard`) renderiza `clusters` e `scores`.

**Acceptance Scenarios**:

1. **Given** mesas publicaram checagens da noite, **When** o cliente pede `/api/feed`, **Then** `clusters[].items[]` trazem `sourceName`, `sourceUrl`, `verdict` e `originalVerdictLabel`.
2. **Given** nenhuma checagem ao vivo, **When** o feed é gerado, **Then** `counts.liveFactcheck === 0`, índices ficam em 0 e há um banner de espera — nenhum card inventado.

### User Story 2 — Saúde das mesas (Priority: P1)

O painel mostra se cada mesa está `live` ou `offline`, com contagem de checagens capturadas.

**Independent Test**: `GET /api/sources` devolve `{ generatedAt, sources }`.

**Acceptance Scenarios**:

1. **Given** um adaptador recebe HTTP de erro, **When** a ingestão termina, **Then** `sources[].online === false`, `mode === "offline"`, `items` daquela fonte não são fabricados.
2. **Given** `lastError` ou `note` contém texto de rede interna, **When** o JSON público sai, **Then** o campo vira `"indisponível"`.

### User Story 3 — Cruzamento semântico em segundo plano (Priority: P2)

Se `llm-internal` estiver configurado e alcançável no servidor, o processo refina os clusters. O cliente nunca espera o modelo.

**Independent Test**: `POST /api/crossing` responde na hora com `crossing.status === "pending"` (ou reusa `ready`); o badge mostra «Consenso Ollama» + modelo **somente** depois de `status === "ready"` e `engine === "ollama"`.

**Acceptance Scenarios**:

1. **Given** o modelo responde JSON de grupos, **When** `refineClustersWithOllama` termina, **Then** `crossing.engine === "ollama"`, `crossing.model` é um token seguro, e **não** há host/URL no payload.
2. **Given** o modelo cai, estoura 45 s ou devolve JSON vazio, **When** o fallback roda, **Then** clusters vêm de `clusterFactChecks` e `crossing.status === "fallback"`, `error === "indisponível"`.

### User Story 4 — Arquivo após o cutoff (Priority: P1)

Depois de 24/10/2026 12:00 em Brasília (ou com flag/lock), a captura para e o painel serve o snapshot.

**Independent Test**: com `shouldStopLiveCapture() === true`, `GET /api/feed` devolve `archive.offline === true`; `POST /api/refresh` e `POST /api/crossing` respondem 410.

**Acceptance Scenarios**:

1. **Given** cutoff ultrapassado e `data/offline-snapshot.json` existe, **When** o cliente pede o feed, **Then** o JSON é o snapshot já sanitizado + `archive`.
2. **Given** modo arquivo, **When** alguém POSTa refresh/crossing, **Then** `{ error: "Captura em tempo real encerrada", archive: true }` com status 410.

### User Story 5 — Laboratório didático (Priority: P2)

Quem estuda o sistema lê o guia, baixa o notebook e os JSONs de ensino, e encontra a spec de contratos.

**Independent Test**: `/laboratorio` liga para `/laboratorio/arquitetura.md`, `/laboratorio/crossnews_captura_cruzamento.ipynb` e `/laboratorio/spec/spec.md`.

### Edge Cases

- Título com menos de 20 caracteres, página de metodologia, URL que não é liveblog **e** texto fora do debate, ou timestamp fora da noite → item descartado em `collectLive`.
- Assinatura de checagens igual à anterior e cruzamento `ready`/`ollama` → reusa clusters; `pending` → não dispara de novo; `fallback` → mantém fallback.
- `POST /api/crossing` é fire-and-forget: o túnel público encerraria a requisição se o servidor esperasse os lotes.
- Snapshot ilegível ou ausente: serve o store em memória sanitizado, ou um `emptyFeed` com banner de arquivo.

---

## Requirements

### Functional Requirements

- **FR-001**: O sistema MUST expor `GET /api/feed` com o `FeedResponse` atual, já sanitizado.
- **FR-002**: O sistema MUST expor `GET /api/sources` com `{ generatedAt, sources }`.
- **FR-003**: O sistema MUST expor `POST /api/refresh` (roda `runIngest`) e `POST /api/crossing` (enfileira IA), ambos 410 após o cutoff.
- **FR-004**: Cada mesa MUST ter um `SourceAdapter` que devolve `AdapterResult`; falha de rede MUST zerar `items` e marcar `online: false`.
- **FR-005**: Itens MUST usar o schema `FeedItem`. O painel mostra `originalVerdictLabel`; o índice usa `verdict` canônico.
- **FR-006**: Cluster heurístico MUST ser determinístico (`clusterFactChecks`). Consenso MUST seguir as regras de `cluster.ts` (fato+fake → `divergente`; só correção dura → `fake`).
- **FR-007**: Índices MUST usar pesos de `verdictWeight`: verdadeiro=1; contexto/exagerado/impreciso=0,5; falso/insustentável=0; inconclusivo não entra. Sem peso, `truthIndex` e `lieIndex` = 0.
- **FR-008**: Cruzamento por modelo MUST ocorrer só no servidor, via `serverEnv("OLLAMA_HOST")` / `OLLAMA_MODEL`, com `node:child_process` + `curl`. O cliente MUST ver só `publicCrossing`.
- **FR-009**: `publicCrossing` MUST omitir host/IP/porta/URL; MUST validar `model` com `PUBLIC_MODEL_RE` e `promptVersion` com `PUBLIC_PROMPT_VERSION_RE`; MUST filtrar `guardrails` pela allowlist (máx. 16); em `fallback`, `error` MUST ser `"indisponível"`.
- **FR-010**: `sanitizePublicFeed` MUST aplicar `publicCrossing` (incluindo o guardrail `public-sanitize`), forçar `schemaVersion`, redigir `sources[].lastError` e `note` suspeitos, e filtrar `banners` que vazem rede interna.
- **FR-011**: Rotas de API MUST enviar `Cache-Control: no-store, max-age=0` e `runtime = "nodejs"`.
- **FR-012**: Após cutoff / `OFFLINE_MODE` ∈ {1,true,yes} / existência de `data/offline.lock`, o sistema MUST parar ingestão e Ollama.
- **FR-013**: Não há autenticação na v1. Persistência é memória do processo + `data/offline-snapshot.json`.
- **FR-014**: A única env pública é `NEXT_PUBLIC_GA_MEASUREMENT_ID` (formato `G-…`). Qualquer outra env interna MUST ser lida por `serverEnv` e MUST ser ignorada se o nome começar com `NEXT_PUBLIC_` no parser de arquivo.
- **FR-015**: Cruzamento MUST persistir `promptVersion` (`PROMPT_VERSION` em `src/lib/ai-governance.ts`), `signature` (versão do lote) e `schemaVersion`. Guardrails MUST ser funções nomeadas em `ai-governance.ts`. O modelo MUST NOT escrever `FeedItem.verdict`.

### Key Entities

Ver a seção **Data schemas** abaixo. Relação: `SourceAdapter.fetchLatest` → `FeedItem[]` → `collectLive` → `ClaimCluster[]` + `CandidateScore[]` → `FeedResponse` → `sanitizePublicFeed` → JSON público.

---

## Data schemas

Fonte: `src/lib/types.ts`, `src/lib/ai-governance.ts`, `src/lib/adapters/types.ts`, `src/lib/offline.ts`, `src/lib/ollama-crossing.ts`, `notebooks/data/*.json`. Campos opcionais marcados com `?`. Ensaio: `docs/schemas.md` · `docs/governanca-ia.md`.

### Uniões

| Tipo | Valores literais |
| --- | --- |
| `CandidateId` | `flavio_bolsonaro` \| `lula` \| `ambos` \| `nenhum` |
| `ItemKind` | `news` \| `factcheck` |
| `Verdict` | `verdadeiro` \| `exagerado` \| `impreciso` \| `falso` \| `insustentavel` \| `contexto` \| `inconclusivo` |
| `Consensus` | `fato` \| `fake` \| `divergente` \| `inconclusivo` |
| `SourceMode` | `live` \| `offline` |
| `CrossingStatus` | `pending` \| `ready` \| `fallback` |
| `CrossingEngine` | `ollama` \| `heuristic` |

Rótulos públicos (`CANDIDATE_LABEL`, `VERDICT_LABEL`, `CONSENSUS_LABEL`) vivem no mesmo arquivo; o badge de consenso do cluster usa FATO / FAKE / DIVERGENTE / INCONCLUSIVO.

Constantes no mesmo arquivo: `SCHEMA_VERSION = 1` (bump ao adicionar/remover campo público); `PUBLIC_MODEL_RE` = `^[a-z0-9][a-z0-9._:-]{1,47}$`; `PUBLIC_PROMPT_VERSION_RE` = `^[a-z0-9][a-z0-9._-]{1,31}$`; `PUBLIC_GUARDRAIL_IDS` = `json-only` \| `allowlist-enums` \| `no-unknown-ids` \| `no-invented-verdict` \| `heuristic-score` \| `force-divergente` \| `timeout-fallback` \| `public-sanitize`. Tipo `GuardrailId` é essa união.

### `CrossingMeta`

| Campo | Tipo | Notas |
| --- | --- | --- |
| `status` | `CrossingStatus` | |
| `engine` | `CrossingEngine` | |
| `model?` | `string` | Só nome do modelo. Público só se passar `PUBLIC_MODEL_RE`. |
| `promptVersion?` | `string` | Ex. `cross-v1`. Público só se passar `PUBLIC_PROMPT_VERSION_RE`. |
| `signature?` | `string` | Versão do lote de entrada: fingerprint dos ids de factcheck (`id1\|id2\|…`) |
| `schemaVersion?` | `number` | Público: número ou, se ausente, `SCHEMA_VERSION` |
| `updatedAt?` | `string` | ISO |
| `error?` | `string` | No JSON público, em `fallback`, sempre `"indisponível"` |
| `guardrails?` | `string[]` | Filtrados pela allowlist, no máximo 16 |

`publicCrossing(meta)` devolve `{ status, engine, signature, schemaVersion, updatedAt }`; copia `model` / `promptVersion` se os regex aceitarem; copia `guardrails` allowlisted; em `fallback`, `error: "indisponível"`.

### `FeedItem`

| Campo | Tipo |
| --- | --- |
| `id` | `string` |
| `kind` | `ItemKind` |
| `sourceId` | `string` |
| `sourceName` | `string` |
| `sourceUrl` | `string` |
| `title` | `string` |
| `claim` | `string` |
| `verdict` | `Verdict \| null` |
| `originalVerdictLabel` | `string \| null` |
| `summary` | `string` |
| `candidate` | `CandidateId` |
| `topic` | `string` |
| `publishedAt` | `string` |
| `fetchedAt` | `string` |

### `ClaimCluster`

| Campo | Tipo |
| --- | --- |
| `id` | `string` |
| `canonicalClaim` | `string` |
| `candidate` | `CandidateId` |
| `topic` | `string` |
| `items` | `FeedItem[]` |
| `convergenceCount` | `number` |
| `divergenceCount` | `number` |
| `consensus` | `Consensus` |
| `consensusScore` | `number` |
| `latestAt` | `string` |
| `justification?` | `string` |
| `crossingEngine?` | `CrossingEngine` |

### `CandidateScore`

`candidate` é `Exclude<CandidateId, "ambos" | "nenhum">` — só `flavio_bolsonaro` \| `lula`.

| Campo | Tipo |
| --- | --- |
| `candidate` | `"flavio_bolsonaro" \| "lula"` |
| `name` | `string` |
| `checksTotal` | `number` |
| `verdadeiro` | `number` |
| `falso` | `number` |
| `outros` | `number` |
| `convergencias` | `number` |
| `divergencias` | `number` |
| `truthIndex` | `number` |
| `lieIndex` | `number` |

### `SourceStatus`

| Campo | Tipo |
| --- | --- |
| `id` | `string` |
| `name` | `string` |
| `homepage` | `string` |
| `liveUrl` | `string \| null` |
| `priority` | `number` |
| `online` | `boolean` |
| `mode` | `SourceMode` |
| `lastSuccessAt` | `string \| null` |
| `lastError` | `string \| null` |
| `lastFetchedAt` | `string \| null` |
| `liveCount` | `number` |
| `newsCount` | `number` |
| `factcheckCount` | `number` |
| `note` | `string \| null` |

### `ArchiveMeta`

| Campo | Tipo |
| --- | --- |
| `offline` | `boolean` |
| `cutoffAt` | `string` |
| `snapshotAt` | `string \| null` |

### `FeedResponse`

| Campo | Tipo |
| --- | --- |
| `schemaVersion` | `number` |
| `generatedAt` | `string` |
| `lastIngestAt` | `string \| null` |
| `debate` | `{ outlet: string; title: string; candidates: string[]; dateLabel: string }` |
| `clusters` | `ClaimCluster[]` |
| `news` | `FeedItem[]` |
| `scores` | `CandidateScore[]` |
| `sources` | `SourceStatus[]` |
| `counts` | `{ news: number; factcheck: number; liveNews: number; liveFactcheck: number }` |
| `banners` | `string[]` |
| `crossing` | `CrossingMeta` |
| `archive?` | `ArchiveMeta` |

`emptyFeed` preenche `schemaVersion: SCHEMA_VERSION`, `debate` com `outlet: "Rede Globo"`, `title: "Debate presidencial de 2º turno"`, `candidates: ["Flávio Bolsonaro (PL)", "Lula (PT)"]`, `dateLabel: "23 de outubro de 2026"`, e `crossing: { status: "pending", engine: "heuristic", promptVersion: PROMPT_VERSION, schemaVersion: SCHEMA_VERSION }` (`PROMPT_VERSION` = `"cross-v1"` em `src/lib/ai-governance.ts`).

### Contrato do adaptador

`src/lib/adapters/types.ts`:

```ts
interface SourceAdapter {
  id: string;
  name: string;
  homepage: string;
  liveUrl?: string;
  priority: number;
  pollMs: number;
  fetchLatest(): Promise<AdapterResult>;
}

interface AdapterResult {
  items: FeedItem[];
  status: Omit<SourceStatus, "mode" | "liveCount" | "newsCount" | "factcheckCount"> & {
    lastError: string | null;
    note: string | null;
  };
}
```

O loop de ingestão é global (`INGEST_MS = 30_000`); `pollMs` existe no contrato mas o orquestrador não dispara um timer por mesa.

Adaptadores registrados em `src/lib/adapters/index.ts` (ids reais):

| `id` | `name` |
| --- | --- |
| `g1_fato_ou_fake` | G1 Fato ou Fake |
| `uol_confere` | UOL Confere / Radar da Eleição |
| `terra_aos_fatos` | Terra / Aos Fatos |
| `folha_lupa` | Folha / Agência Lupa |
| `estadao_verifica` | Estadão Verifica |
| `afp_chegamos` | AFP Chegamos |
| `comprova` | Projeto Comprova |

`secondaryAdapters` é `[]` (reserva).

### Envelope Firecrawl (reconhecimento, não runtime)

Dumps brutos em `.firecrawl/` (gitignored). Envelope documentado pelo código de ensino e por `docs/arquitetura.md`:

```json
{
  "markdown": "texto limpo",
  "metadata": { "sourceURL": "https://…", "title": "…", "statusCode": 200 },
  "links": ["https://…"],
  "rawHtml": "<html>…opcional…"
}
```

O app de produção **não** chama Firecrawl no loop de 30 s.

### JSON de ensino do notebook

#### `checagens_debate.json`

| Campo | Tipo |
| --- | --- |
| `gerado_em` | `string` (ISO) |
| `debate` | mesmo objeto de `FeedResponse.debate` |
| `nota` | `string` |
| `counts` | `{ news, factcheck, liveNews, liveFactcheck }` |
| `scores_referencia` | `CandidateScore[]` |
| `items` | lista no formato `FeedItem` **sem** `fetchedAt` |

#### `corpus_firecrawl.json`

| Campo | Tipo |
| --- | --- |
| `gerado_em` | `string` |
| `nota` | `string` |
| `fontes` | array de recortes |

Cada fonte:

| Campo | Tipo |
| --- | --- |
| `arquivo` | `string` |
| `mesa` | `string` |
| `sourceURL` | `string` |
| `title` | `string` |
| `description` | `string` |
| `datePublished` | `string[] \| null` |
| `statusCode` | `number` |
| `contentType` | `string` |
| `markdown_chars` | `number` |
| `links_count` | `number` |
| `markdown_excerpt` | `string` |
| `formato_firecrawl` | `("markdown" \| "metadata" \| "links" \| "rawHtml")[]` |
| `vueland_cards?` | `{ id, title, author, content, type, date }[]` |

`vueland_cards[].date` é epoch em milissegundos (número), como no dump UOL.

### Contrato interno do modelo (servidor)

Entrada compacta por item: `{ id, mesa, candidato, selo, veredito, afirmação }` (`afirmação` truncada a 220).

Saída pedida:

```json
{
  "groups": [
    {
      "itemIds": ["id"],
      "canonicalClaim": "…",
      "candidate": "lula|flavio_bolsonaro|ambos|nenhum",
      "consensus": "fato|fake|divergente|inconclusivo",
      "justification": "…"
    }
  ]
}
```

`justification` truncada a 280 no parser. Grupos sem `itemIds` são descartados. Sobras voltam ao motor heurístico.

### Envelope do snapshot offline

Arquivo `data/offline-snapshot.json`. Aceita `{ snapshotAt?, cutoffAt?, feed?: FeedResponse }` **ou** um `FeedResponse` nu (detectado por `clusters` ser array). Sempre re-sanitizado ao carregar.

---

## HTTP APIs

Route Handlers Next.js (`app/api/*/route.ts`). Web `Request` / `Response`. Docs locais: `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`.

Todas: `export const dynamic = "force-dynamic"` · `export const runtime = "nodejs"` · header `Cache-Control: no-store, max-age=0`.

| Rota | Método | Corpo de resposta | 410? |
| --- | --- | --- | --- |
| `/api/feed` | GET | `FeedResponse` (`getFeed()` → sanitizado + `archive`) | não |
| `/api/sources` | GET | `{ generatedAt: string, sources: SourceStatus[] }` | não |
| `/api/refresh` | POST | `FeedResponse` após `runIngest()` | sim, se arquivo |
| `/api/crossing` | POST | `FeedResponse` imediato (`requestCrossing`) | sim, se arquivo |

410:

```json
{ "error": "Captura em tempo real encerrada", "archive": true }
```

Não há autenticação. Não há query params nem body documentados nestas rotas.

O `Dashboard` faz `fetch("/api/feed", { cache: "no-store" })` a cada 10 s até `archive.offline`.

---

## Security — como o backend é protegido

Leitura obrigatória: `src/lib/offline.ts`, `src/lib/types.ts` (`publicCrossing`), `src/lib/server-env.ts`, `src/lib/ollama-crossing.ts`, `src/app/api/*`, `.env.example`.

### Superfície pública

Só o hostname público atrás de `tunnel-edge`. Não publicar A/AAAA/CNAME para `origin-app`, `llm-internal` ou redes privadas. Não citar IP, porta, overlay mesh ou nome de máquina nos artefatos que o cliente baixa.

### Env server-only

`serverEnv` / `loadServerEnv` (`src/lib/server-env.ts`):

- **Nunca** importar de Client Components.
- Parser de arquivo **ignora** chaves `NEXT_PUBLIC_*` (não as coloca no cache interno).
- Arquivos: `CROSSNEWS_ENV_FILE` (se definido), depois `.env.production`, depois `.env.local`.
- Overlay de `process.env` só para `OLLAMA_HOST`, `OLLAMA_MODEL`, `OFFLINE_MODE`, `OFFLINE_CUTOFF_ISO`.
- Se `typeof window !== "undefined"`, o loader retorna sem ler disco.

Next.js só embute no bundle do browser variáveis `NEXT_PUBLIC_*` (`node_modules/next/dist/docs/01-app/02-guides/environment-variables.md`). Por isso host do modelo **não** pode ter esse prefixo.

### Variáveis (`.env.example` — placeholders)

| Nome | Público? | Papel |
| --- | --- | --- |
| `OLLAMA_HOST` | não | Endpoint interno do modelo. Placeholder: `http://llm-internal`. Sem prefixo `http`, o código prefixa `http://`. |
| `OLLAMA_MODEL` | não | Nome do modelo (pode ir ao badge se o regex aceitar). Placeholder: `instruct-7b`. |
| `OFFLINE_MODE` | não | `1` / `true` / `yes` força arquivo. |
| `OFFLINE_CUTOFF_ISO` | não | Padrão `2026-10-24T15:00:00.000Z` (12:00 em Brasília). |
| `CROSSNEWS_ENV_FILE` | não | Caminho absoluto opcional do arquivo de env. |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | sim | Stream GA4. Vazio desliga. Validado por `^G-[A-Z0-9]+$`. Placeholder `G-XXXXXXXX`. |

Não commitar hosts reais. Não rsync `.env*` do laptop. Não documentar URL real do modelo.

### Ollama só no servidor

`ollama-crossing.ts` lê o host via `serverEnv`, fala com `llm-internal` por `execFile("/usr/bin/curl", …)` (`node:child_process`) — não `fetch` no cliente, não `NEXT_PUBLIC`. Prompts e timeouts vivem em `ai-governance.ts`. Timeouts: tags 4 s, chat 45 s. Erros viram `"indisponível"`. O badge (`Dashboard.CrossingBadge`) mostra «Consenso Ollama» + `crossing.model` + `crossing.promptVersion`, nunca o endpoint.

### Sanitização de saída

`sanitizePublicFeed` em todo `getFeed()` (vivo, snapshot ou store congelado):

1. `schemaVersion ← feed.schemaVersion ?? SCHEMA_VERSION`
2. `crossing ← publicCrossing(crossing)` com guardrail `public-sanitize` acrescentado se faltar
3. `sources[].lastError` e `note` ← `publicSourceText` (padrão de vazamento → `"indisponível"`)
4. `banners` filtrados se o texto parecer vazamento

A regex de vazamento **não** deve ser copiada para material público: ela existe para bloquear, não para mapear a rede.

### Cache e arquivo

- `Cache-Control: no-store, max-age=0` impede selo velho no CDN do `tunnel-edge`.
- `shouldStopLiveCapture` = flag env **ou** `data/offline.lock` **ou** `now >= cutoff`.
- Snapshot em `data/offline-snapshot.json`; caminho via `process.cwd()`.

---

## Success Criteria

- **SC-001**: `GET /api/feed` nunca inclui host, IP, porta ou URL de `llm-internal` / `origin-app`.
- **SC-002**: Com mesas no ar, o painel mostra clusters atribuídos (mesa + URL) em menos de um ciclo de poll do cliente (10 s) após a ingestão (30 s).
- **SC-003**: Sem checagem com peso, ambos os índices são 0.
- **SC-004**: Modelo ausente ou morto → painel permanece no consenso heurístico; nunca tela em branco.
- **SC-005**: Após o cutoff, POST de captura/cruzamento é 410 e GET serve arquivo.
- **SC-006**: Laboratório e spec pública abrem em `/laboratorio` e `/laboratorio/spec/spec.md` sem credencial.
- **SC-007**: `GET /api/feed` em cruzamento `ready`/`ollama` inclui `crossing.promptVersion` e `crossing.schemaVersion` e nunca host/IP/porta.

## Assumptions

- Sem banco pago na v1; restart zera memória (exceto snapshot).
- Sites das mesas podem bloquear HTML (403) — fonte OFF.
- Isto não é produto oficial do TSE, da Globo ou de campanha.
- Firecrawl é ferramenta de véspera, não dependência de runtime.
- Agentes de código leem esta spec **e** o TypeScript; não implementam campos que só existam num dos dois.
