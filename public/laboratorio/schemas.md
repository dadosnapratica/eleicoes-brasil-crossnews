# Schemas internos × públicos

Guia para quem está começando: o CrossNews guarda **mais** no servidor do que mostra na internet. Este arquivo lista os campos **reais** do TypeScript (`src/lib/types.ts`, `src/lib/adapters/types.ts`, `src/lib/ai-governance.ts`, `src/lib/offline.ts`, `src/lib/server-env.ts`). Se o código e este texto divergirem, o TypeScript vence.

Contrato para agentes: [spec pública](./spec/spec.md). Política da IA: [`governanca-ia.md`](./governanca-ia.md). Ensaio de arquitetura: [`arquitetura.md`](./arquitetura.md).

`FeedResponse.schemaVersion` hoje é **`1`**. Quando um campo público entrar ou sair, esse número sobe.

---

## 1. Por que dois mundos

Imagine uma redação com uma sala de máquinas e uma vitrine.

- **Interno** (sala de máquinas): o processo Next.js (`origin-app`) baixa as mesas, fala com o modelo (`llm-internal`), guarda o último `FeedResponse` na memória e, depois do cutoff, um snapshot em disco.
- **Público** (vitrine, só `tunnel-edge`): `GET /api/feed` e `GET /api/sources` devolvem um JSON **já passado** por `sanitizePublicFeed` / `publicCrossing`.

O navegador **nunca** recebe host, IP, porta ou URL de fetch do modelo. O selo do painel pode dizer «Consenso Ollama» + o **nome** do modelo + a **versão do prompt**. Nada além disso.

```text
adaptadores  →  store (FeedResponse interno)
                    ↓  sanitizePublicFeed
              GET /api/feed   GET /api/sources
                    ↓
              tunnel-edge  →  eleitor
```

---

## 2. Uniões (iguais nos dois lados)

| Tipo | Valores |
| --- | --- |
| `CandidateId` | `flavio_bolsonaro` \| `lula` \| `ambos` \| `nenhum` |
| `ItemKind` | `news` \| `factcheck` |
| `Verdict` | `verdadeiro` \| `exagerado` \| `impreciso` \| `falso` \| `insustentavel` \| `contexto` \| `inconclusivo` |
| `Consensus` | `fato` \| `fake` \| `divergente` \| `inconclusivo` |
| `SourceMode` | `live` \| `offline` |
| `CrossingStatus` | `pending` \| `ready` \| `fallback` |
| `CrossingEngine` | `ollama` \| `heuristic` |
| `GuardrailId` | `json-only` \| `allowlist-enums` \| `no-unknown-ids` \| `no-invented-verdict` \| `heuristic-score` \| `force-divergente` \| `timeout-fallback` \| `public-sanitize` |

---

## 3. Schema interno (servidor)

### `FeedItem`

Uma checagem ou uma notícia, já padronizada pelo adaptador.

| Campo | Tipo |
| --- | --- |
| `id` | `string` |
| `kind` | `ItemKind` |
| `sourceId` | `string` |
| `sourceName` | `string` |
| `sourceUrl` | `string` (URL **pública** da mesa, não de infra) |
| `title` | `string` |
| `claim` | `string` |
| `verdict` | `Verdict \| null` |
| `originalVerdictLabel` | `string \| null` |
| `summary` | `string` |
| `candidate` | `CandidateId` |
| `topic` | `string` |
| `publishedAt` | `string` |
| `fetchedAt` | `string` |

O modelo **não** escreve `verdict`. Esse selo veio da mesa (`detectVerdict`).

### `ClaimCluster`

Agrupamento da *mesma* afirmação.

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

Só `flavio_bolsonaro` e `lula`. Campos: `candidate`, `name`, `checksTotal`, `verdadeiro`, `falso`, `outros`, `convergencias`, `divergencias`, `truthIndex`, `lieIndex`.

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

`homepage` e `liveUrl` são URLs **das mesas** (g1, UOL…). Internamente `lastError` pode trazer texto cru de rede; na saída pública isso é redigido.

### `ArchiveMeta`

`offline: boolean`, `cutoffAt: string`, `snapshotAt: string | null`.

### `CrossingMeta` (interno)

| Campo | Tipo | Papel |
| --- | --- | --- |
| `status` | `CrossingStatus` | `pending` / `ready` / `fallback` |
| `engine` | `CrossingEngine` | `ollama` ou `heuristic` |
| `model?` | `string` | Nome do modelo (nunca o host) |
| `promptVersion?` | `string` | Versão do prompt, hoje `cross-v1` |
| `signature?` | `string` | Versão do **lote de entrada**: ids de factcheck ordenados, juntos com `\|` (`fingerprintFactChecks`) |
| `schemaVersion?` | `number` | Versão do contrato de cruzamento (hoje `1`) |
| `updatedAt?` | `string` | ISO |
| `error?` | `string` | Pode ser texto interno no store; no JSON público vira `"indisponível"` |
| `guardrails?` | `string[]` | Ids das regras aplicadas |

### `FeedResponse` (store)

O que `store.ts` guarda na memória do processo — um único objeto.

| Campo | Tipo |
| --- | --- |
| `schemaVersion` | `number` (`1`) |
| `generatedAt` | `string` |
| `lastIngestAt` | `string \| null` |
| `debate` | `{ outlet, title, candidates, dateLabel }` |
| `clusters` | `ClaimCluster[]` |
| `news` | `FeedItem[]` |
| `scores` | `CandidateScore[]` |
| `sources` | `SourceStatus[]` |
| `counts` | `{ news, factcheck, liveNews, liveFactcheck }` |
| `banners` | `string[]` |
| `crossing` | `CrossingMeta` |
| `archive?` | `ArchiveMeta` |

`debate` fixo desta noite: `outlet: "Rede Globo"`, `title: "Debate presidencial de 2º turno"`, `candidates: ["Flávio Bolsonaro (PL)", "Lula (PT)"]`, `dateLabel: "23 de outubro de 2026"`.

### `AdapterResult` (só servidor)

`src/lib/adapters/types.ts`:

```ts
interface AdapterResult {
  items: FeedItem[];
  status: Omit<SourceStatus, "mode" | "liveCount" | "newsCount" | "factcheckCount">
    & { lastError: string | null; note: string | null };
}
```

`SourceAdapter` ainda tem `id`, `name`, `homepage`, `liveUrl?`, `priority`, `pollMs`, `fetchLatest()`.

### Snapshot offline

Arquivo `data/offline-snapshot.json` (não vai para o git):

```json
{
  "snapshotAt": "2026-10-24T15:00:00.000Z",
  "cutoffAt": "2026-10-24T15:00:00.000Z",
  "feed": { "schemaVersion": 1, "clusters": [], "crossing": {} }
}
```

O loader também aceita um `FeedResponse` nu (se `clusters` for array). Sempre re-sanitiza ao ler.

### Pedido / resposta do modelo (só servidor)

Montados em `ollamaChatBody` / lidos em `chatJson`. **Nunca** saem em `/api/*`.

Pedido:

```json
{
  "model": "instruct-7b",
  "stream": false,
  "format": "json",
  "options": { "temperature": 0.1, "num_predict": 900 },
  "messages": [
    { "role": "system", "content": "…" },
    { "role": "user", "content": "…" }
  ]
}
```

Resposta usada: `{ "message": { "content": "{ \"groups\": […] }" } }`.

Entrada compacta por item: `{ id, mesa, candidato, selo, veredito, afirmação }` (`afirmação` ≤ 220). Saída pedida: `{ groups: [{ itemIds, canonicalClaim, candidate, consensus, justification }] }`.

### Envelope Firecrawl (véspera, não runtime)

Dumps em `.firecrawl/` (gitignored). O app **não** chama Firecrawl no loop de 30 s.

```json
{
  "markdown": "texto limpo",
  "metadata": { "sourceURL": "https://…", "title": "…", "statusCode": 200 },
  "links": ["https://…"],
  "rawHtml": "<html>…opcional…"
}
```

### Chaves de ambiente

Lidas por `serverEnv` / `loadServerEnv`. Arquivos: `CROSSNEWS_ENV_FILE` (se definido), depois `.env.production`, depois `.env.local`. O parser **ignora** chaves `NEXT_PUBLIC_*` no arquivo (não as coloca no cache interno). Overlay de `process.env` só para as quatro primeiras da tabela.

| Nome | Público? | Papel |
| --- | --- | --- |
| `OLLAMA_HOST` | não | Endpoint interno do modelo. Placeholder: `http://llm-internal` |
| `OLLAMA_MODEL` | não | Nome do modelo (pode ir ao badge se o regex aceitar) |
| `OFFLINE_MODE` | não | `1` / `true` / `yes` força arquivo |
| `OFFLINE_CUTOFF_ISO` | não | Padrão `2026-10-24T15:00:00.000Z` |
| `CROSSNEWS_ENV_FILE` | não | Caminho opcional do arquivo de env |
| `CROSSNEWS_LAUNCHD_LABEL` | não | Rótulo do processo de origem. Placeholder: `origin-app` |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | sim | Stream GA4. Vazio desliga. Formato `G-…` |

Nunca `NEXT_PUBLIC_*` para host interno. Nunca commitar hosts reais.

---

## 4. Schema público (o que a internet vê)

### `GET /api/feed`

Devolve `getFeed()` → `sanitizePublicFeed(feed)` + `archive`. Mesmos campos de `FeedResponse`, com três restrições:

1. `crossing` passou por `publicCrossing` (lista branca abaixo).
2. `sources[].lastError` e `sources[].note` viram `"indisponível"` se o texto parecer vazamento de rede.
3. `banners` que pareçam vazamento são **removidos**.

`Cache-Control: no-store, max-age=0`. Sem autenticação. Sem query params.

### `GET /api/sources`

```json
{ "generatedAt": "2026-10-24T12:00:00.000Z", "sources": [ /* SourceStatus já sanitizado */ ] }
```

É um recorte do feed público, não um schema paralelo.

### `CrossingMeta` público (lista branca)

`publicCrossing` copia **somente**:

| Campo | Condição |
| --- | --- |
| `status` | sempre |
| `engine` | sempre |
| `signature` | se existir (versão do lote) |
| `schemaVersion` | número, ou `1` se ausente |
| `updatedAt` | se existir |
| `model` | só se casar `^[a-z0-9][a-z0-9._:-]{1,47}$` |
| `promptVersion` | só se casar `^[a-z0-9][a-z0-9._-]{1,31}$` |
| `guardrails` | só ids conhecidos, no máximo 16 |
| `error` | **só** se `status === "fallback"`, e **sempre** `"indisponível"` |

Exemplo realista (sem host):

```json
{
  "status": "ready",
  "engine": "ollama",
  "model": "instruct-7b",
  "promptVersion": "cross-v1",
  "signature": "estadao_verifica_a51c|g1_fato_ou_fake_bb12",
  "schemaVersion": 1,
  "updatedAt": "2026-10-24T03:12:00.000Z",
  "guardrails": [
    "json-only",
    "allowlist-enums",
    "no-unknown-ids",
    "no-invented-verdict",
    "heuristic-score",
    "force-divergente",
    "public-sanitize"
  ]
}
```

Em fallback:

```json
{
  "status": "fallback",
  "engine": "heuristic",
  "promptVersion": "cross-v1",
  "signature": "estadao_verifica_a51c|g1_fato_ou_fake_bb12",
  "schemaVersion": 1,
  "updatedAt": "2026-10-24T03:12:00.000Z",
  "error": "indisponível",
  "guardrails": ["timeout-fallback", "public-sanitize"]
}
```

---

## 5. O que é STRIPPED da superfície pública

Estes dados existem no servidor (ou poderiam vazar num erro) e **não** podem aparecer em JSON, HTML, badge ou JS do cliente:

| Dado | Onde mora | Como some |
| --- | --- | --- |
| Host / IP / porta do modelo | `ollamaConfig().host`, `OLLAMA_HOST` | nunca serializado; `publicCrossing` não tem campo de host |
| URL de fetch do modelo (`/api/chat`, `/api/tags`) | `ollama-crossing.ts` | só `execFile` no servidor |
| Texto cru de erro (timeout, DNS, curl) | `crossing.error` interno, `sources[].lastError` | público: `"indisponível"` ou banner removido |
| Nome de máquina de origem, overlay mesh, redes privadas | logs / env | regex de recusa em `sanitizePublicFeed` |
| `OLLAMA_HOST` e demais env internas | `serverEnv` | sem `NEXT_PUBLIC_` |
| Corpo do pedido/resposta do modelo | `chatJson` | não entra no `FeedResponse` |
| Dumps Firecrawl | `.firecrawl/` | não são API |
| `model` que pareça caminho ou URL | `CrossingMeta.model` | regex; senão o campo some |
| `promptVersion` estranho | idem | regex; senão some |
| `guardrails` desconhecidos | idem | filtrados |

`sourceUrl`, `homepage` e `liveUrl` das **mesas jornalísticas** continuam públicos: são o link de atribuição, não infra.

---

## 6. Versionamento de dados

- **`schemaVersion` (`1`)** — contrato do `FeedResponse` / `CrossingMeta`. Suba quando adicionar ou remover campo público.
- **`signature`** — versão do **lote de entrada** (ids de factcheck). Se o lote não mudou e o cruzamento já está `ready`/`ollama`, a ingestão reusa os clusters.
- **`promptVersion` (`cross-v1`)** — versão do texto e dos parâmetros do modelo. Ver [governanca-ia.md](./governanca-ia.md).
