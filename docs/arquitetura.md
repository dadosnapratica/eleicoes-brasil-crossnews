# Arquitetura do CrossNews

Guia técnico para quem está começando ou já programa, e quer entender **como se captura checagem jornalística em tempo quase real**, **como se cruza o que várias mesas disseram sobre a mesma fala**, e **como uma IA local entra sem inventar veredito**.

O CrossNews é um painel **não partidário**. Ele **não apura** se o candidato falou a verdade. Ele **agrega** o que G1 Fato ou Fake, UOL Confere, Terra / Aos Fatos, Folha / Agência Lupa, Estadão Verifica e outras mesas já publicaram, com link para o original.

> Laboratório prático: abra o [notebook Jupyter](../notebooks/crossnews_captura_cruzamento.ipynb) (botão do Google Colab no topo do arquivo) ou a página [Laboratório](/laboratorio) no site.

---

## 1. O problema em uma frase

No debate, cada mesa publica no próprio site, com selo próprio (`#FATO`, `Enganoso`, `Falta contexto`…). O eleitor teria de abrir quatro ou cinco liveblogs ao mesmo tempo. O CrossNews faz três coisas:

1. **Captura** essas páginas de alguns em alguns segundos.
2. **Agrupa** checagens que falam da *mesma* afirmação, mesmo com redação diferente.
3. **Pondera** os selos e mostra um índice de verdade e de mentira por candidato — sempre atribuído às mesas, nunca inventado.

```text
páginas das mesas  →  adaptadores  →  itens normalizados
                                              ↓
                                    cluster heurístico (rápido)
                                              ↓
                                    índice verdade / mentira
                                              ↓
                         cruzamento semântico (IA local, se estiver no ar)
                                              ↓
                                    GET /api/feed  →  painel
```

Dois relógios diferentes:

| Quem | Intervalo | Por quê |
| --- | --- | --- |
| Servidor (`runIngest`) | 30 s | Não martelar os sites das mesas |
| Navegador (`Dashboard`) | 10 s | O painel parece vivo sem esperar o próximo ciclo de captura |

---

## 2. Mapa do repositório

```text
src/
  app/
    page.tsx                 ← home: só o Dashboard
    laboratorio/page.tsx     ← este guia, em página pública
    api/feed/route.ts        ← GET: estado atual do painel
    api/sources/route.ts     ← GET: saúde das mesas
    api/refresh/route.ts     ← POST: força uma captura
    api/crossing/route.ts    ← POST: pede cruzamento à IA (não espera o modelo)
  lib/
    adapters/                ← um conector por mesa
    http.ts                  ← fetch + RSS + âncoras HTML
    verdict.ts               ← lê o selo no texto
    normalize.ts             ← limpa texto, Jaccard, números, candidato, tema
    cluster.ts               ← agrupa afirmações iguais
    score.ts                 ← índice de verdade / mentira
    ollama-crossing.ts       ← IA local, só no servidor
    ai-governance.ts         ← prompt versionado, guardrails, rastro
    ingest.ts                ← orquestra captura + cruzamento
    store.ts                 ← memória do processo (sem banco)
    offline.ts               ← após o cutoff, vira arquivo
  components/Dashboard.tsx   ← UI
.firecrawl/                  ← dumps brutos de reconhecimento (não vão para o git)
notebooks/                   ← laboratório Jupyter
```

Conceito de iniciante: **adaptador** é uma função que sabe falar a língua de *uma* fonte e devolve sempre o mesmo formato (`FeedItem`). O resto do sistema não precisa saber se veio RSS, HTML ou JSON embutido.

---

## 3. Captura em tempo real

### 3.1 Por que “quase” real

Nenhum site destas mesas oferece um WebSocket público de checagens. O que existe é página HTML, RSS ou um JSON escondido no HTML. Tempo real, aqui, significa **polling**: perguntar de novo, comparar o que mudou, republicar.

Isso é o mesmo padrão de um placar esportivo caseiro: você não está “conectado ao estádio”; você recarrega a súmula.

### 3.2 Firecrawl entra na fase de reconhecimento

Antes de escrever um adaptador, a redação técnica precisa *ver* a página como o coletor vê. Os arquivos em `.firecrawl/` são esse rascunho:

| Arquivo | O que é | O que ensina |
| --- | --- | --- |
| `g1-debate-fato-ou-fake.json` | Metodologia do G1 | Selos oficiais `#FATO`, `#FAKE`, `#NÃOÉBEMASSIM` |
| `uol-confere-radar.json` | Liveblog do Radar (com `rawHtml`) | JSON `#VUELAND_STATE` com cards da cobertura |
| `terra-aos-fatos.json` | Anúncio Terra + Aos Fatos | Como a mesa avisa que vai checar ao vivo |
| `folha-lupa.json` | Anúncio Folha + Lupa | Etiquetas verdadeira / falsa / exagerada / falta contexto |

Cada dump tem o mesmo envelope:

```json
{
  "markdown": "# título e corpo em texto limpo",
  "metadata": { "sourceURL": "...", "title": "...", "statusCode": 200 },
  "links": ["https://..."],
  "rawHtml": "<html>…opcional…"
}
```

Três lições:

1. **Markdown** é ótimo para ler e para regex de selo.
2. **HTML bruto** é obrigatório quando o dado útil está num `<script>` (caso UOL).
3. Um dump da *véspera* documenta a metodologia; as checagens da *noite* só aparecem quando o adaptador volta a baixar a página ao vivo.

O app de produção **não chama Firecrawl a cada 30 s**. Firecrawl é o binóculo. O adaptador é o relógio.

### 3.3 Anatomia de um adaptador

Contrato em `src/lib/adapters/types.ts`:

```ts
interface SourceAdapter {
  id: string;
  name: string;
  homepage: string;
  liveUrl?: string;
  priority: number;
  pollMs: number;
  fetchLatest(): Promise<AdapterResult>; // { items, status }
}
```

Cada `fetchLatest`:

1. Baixa uma ou mais URLs (`fetchText` em `http.ts`, timeout ~12 s, `cache: "no-store"`).
2. Extrai candidatos a checagem (RSS, `<blockquote>`, liveblog, JSON embutido).
3. Classifica `news` × `factcheck`.
4. Detecta o selo (`detectVerdict`).
5. Infere candidato e tema.
6. Devolve itens + um `status` (`online`, `lastError`, `note`).

Se a rede falha ou o site responde 403, o adaptador **não inventa card**. A fonte fica `OFF`. Isso é uma decisão editorial, não um detalhe de implementação.

### 3.4 Três jeitos reais de extrair

**RSS (G1, Aos Fatos, Lupa).** XML com `<item><title><link><description><pubDate>`. É o canal mais estável, mas costuma atrasar em relação ao liveblog.

**HTML estruturado (G1, Estadão, Terra).** O G1 coloca a fala do candidato num `<blockquote>` e o selo no parágrafo seguinte. O Estadão Verifica usa o molde “O que Lula disse: … O Estadão Verifica checou e concluiu que: falso”. Regex com âncoras de linguagem humana é mais robusto do que um seletor CSS que o site muda na segunda-feira.

**JSON embutido (UOL).** O Radar da Eleição hidrata a timeline com:

```html
<script id="VUELAND_STATE">{ "live": { "timeline": [ { "id": "card_…", "title": "…", "content": "…", "author": { "name": "UOL Confere" } } ] } }</script>
```

O adaptador acha o `<script>`, faz `JSON.parse` e caminha o objeto até achar arrays cujo `id` começa com `card_`. Cartões de publicidade (`type === "ad"`) são descartados. Autor contendo “Confere” ou “checagem” marca `factcheck`.

### 3.5 Filtro da noite

`ingest.ts` não publica tudo que o adaptador achou. `collectLive` joga fora:

- título com menos de 20 caracteres
- páginas de metodologia
- URLs que não são o liveblog da noite **e** cujo texto não cita o debate da Globo com os dois candidatos
- timestamps de outro dia (fora de 23/10 00:00 a 24/10 12:00, horário de Brasília)

Resultado: o painel não mistura sabatina de agosto com o debate de sexta.

### 3.6 O loop

```ts
// src/lib/ingest.ts
const INGEST_MS = 30_000;

export function ensureIngestLoop() {
  void runIngest();
  setInterval(() => void runIngest(), INGEST_MS);
}
```

`GET /api/feed` chama `ensureIngestLoop()` na primeira visita. Não há cron externo. O processo Next.js é o coletor.

Depois do cutoff (`OFFLINE_CUTOFF_ISO`, padrão 24/10/2026 12:00 em Brasília) ou com `OFFLINE_MODE=1`, a captura para e o painel serve o arquivo em `data/offline-snapshot.json`.

---

## 4. Do texto sujo ao `FeedItem`

Um item padronizado parece isto:

```ts
{
  id: "estadao_verifica_a51c6bfa",
  kind: "factcheck",
  sourceId: "estadao_verifica",
  sourceName: "Estadão Verifica",
  sourceUrl: "https://www.estadao.com.br/…",
  title: "foi o ex-presidente Jair Bolsonaro quem aumentou o Bolsa Família para R$ 600",
  claim: "foi o ex-presidente Jair Bolsonaro quem aumentou o Bolsa Família para R$ 600",
  verdict: "falso",           // selo interno, canônico
  originalVerdictLabel: "Enganoso", // como a mesa escreveu
  candidate: "flavio_bolsonaro",
  topic: "programas sociais",
  publishedAt: "2026-10-24T01:10:00.000Z"
}
```

Dois campos de veredito existem de propósito. O painel mostra o **rótulo original** (“Enganoso”, “#FAKE”). O índice usa o **selo canônico** (`falso`, `verdadeiro`, `impreciso`…). Assim a Folha pode dizer “exagerada” e o G1 “#NÃOÉBEMASSIM” sem o agregador fingir que falam a mesma palavra.

### 4.1 Como o selo é lido

`detectVerdict` em `verdict.ts` é uma lista ordenada de regex. Hashtags do G1 vêm primeiro (`#FATO`, `#FAKE`, `#NÃOÉBEMASSIM`). Depois vêm palavras das outras mesas (`enganoso`, `subestimado`, `falta contexto`). Por último, correções de liveblog que nunca imprimem selo clássico (“ao contrário do que…”, “dado atualizado”).

Ordem importa: se “falso” viesse antes de “#FATO”, um texto que citasse os dois selos na metodologia marcaria errado.

### 4.2 Candidato e tema

`inferCandidate` procura `lula` / `luiz inacio` e `flavio` / `bolsonaro` (sem `jair`, para não atribuir fala do pai ao filho sem necessidade). Os dois juntos viram `ambos`.

`inferTopic` é um dicionário pequeno (`economia`, `saude`, `programas sociais`…). Não é um classificador treinado. Serve para filtro e para o cruzamento numérico (“6 mil obras” só casa com outro “obras”, não com “6 mil pontos de internet”).

---

## 5. Cruzamento: o que é a “mesma” afirmação

Agrupar “Bolsa Família de R$ 600” com “o auxílio foi a 600 reais” é o coração do produto. Há **dois motores**.

### 5.1 Motor rápido (heurístico, determinístico)

`clusterFactChecks` em `cluster.ts`:

1. Fica só com `kind === "factcheck"` e `claim` não vazio.
2. Percorre os itens do mais novo ao mais velho.
3. Tenta colocar cada um num grupo já existente se:
   - o candidato é compatível (`lula` não casa com `flavio_bolsonaro`; `ambos` e `nenhum` casam com qualquer um);
   - **e** `similarClaims` é verdadeiro entre claim/título do item e o seed do grupo.

`similarClaims` (`normalize.ts`):

1. Tira acento, hashtag, URL, pontuação.
2. Quebra em tokens com mais de 2 letras, sem stopwords (`de`, `que`, `para`…).
3. Calcula **Jaccard** (interseção / união dos conjuntos de palavras) e **overlap** (interseção / tamanho do menor).
4. Casa se Jaccard ≥ 0,34 **ou** overlap ≥ 0,55.
5. Textos muito curtos só casam se forem iguais depois da normalização.

Números ganham um atalho: `6 mil`, `6.000` e `seis mil` viram o token `6000`. `sameNumericClaim` só agrupa se o número for compartilhado **e** o tema for o mesmo (`obra`, `bolsa`, `fome`…). Sem isso, “11,5 mil obras” colaria em “11,5 mil pontos de internet”.

Este motor é **determinístico**: o mesmo lote de itens produz sempre os mesmos clusters. É o que o painel mostra em menos de um segundo, mesmo com a IA desligada.

### 5.2 Consenso do grupo

Cada cluster ganha um balde por item:

| Selo canônico | Balde |
| --- | --- |
| `verdadeiro` | fato |
| `falso`, `insustentavel` | fake |
| `exagerado`, `impreciso`, `contexto` | meio |
| `inconclusivo` ou sem selo | inconclusivo |

Regras, em português:

- Tem fato **e** fake no mesmo grupo → **DIVERGENTE**.
- Só fato (e fato não perde para meio/inconclusivo) → **FATO**.
- Só fake → **FAKE**.
- Só “meio”, e alguém disse impreciso/exagerado → **FAKE** (correção dura, mesmo sem a palavra “falso”).
- Só contexto, sem correção dura → **INCONCLUSIVO**.

`consensusScore` = percentual do maior balde, menos 35 pontos se fato e fake convivem. É um número de unidade do grupo, não um julgamento moral.

### 5.3 Motor lento (IA local, não determinístico)

`refineClustersWithOllama` só roda **no servidor**. O navegador nunca vê host, porta nem URL do modelo. O selo público é “Consenso Ollama” + o **nome** do modelo, nunca o endpoint.

O que a IA faz:

1. Compacta cada checagem em `{ id, mesa, candidato, selo, afirmação }`.
2. Manda lotes de até 12 itens, separados por candidato.
3. Pede JSON: “agrupa o que é A MESMA afirmação; não invente veredito, número nem fonte”.
4. Reconstrói os clusters a partir dos `itemIds` que o modelo devolveu.
5. Recalcula convergência/divergência com a função heurística — a IA não manda no placar numérico.
6. Se verdadeiro e um selo negativo caem no mesmo grupo, força **DIVERGENTE**.
7. Sobras que o modelo esqueceu voltam para o motor heurístico.

O que a IA **não** faz: decidir se a fala do candidato é verdade. Isso continua sendo da mesa.

Por que é não determinístico:

- Modelos generativos **amostram** o próximo token. Mesmo com `temperature: 0.1` (valor usado em produção), duas rodadas do mesmo lote podem juntar ou separar um caso-limite (“6 mil obras” × “mais de seis mil obras paradas”).
- O prompt pede equivalências (`"6 mil"="6.000"="seis mil"`), mas o modelo ainda é um leitor, não uma função hash.
- Se o processo cair, o tempo estourar (45 s) ou o JSON vier vazio, o sistema **cai para o heurístico** e o selo vira “Consenso heurístico”. O painel nunca fica em branco esperando GPU.

Por isso o cruzamento é **assíncrono**. `POST /api/crossing` devolve o feed atual na hora (`pending`) e o Ollama trabalha em segundo plano. A Cloudflare encerraria a requisição (~100 s, erro 524) se o servidor esperasse todos os lotes.

---

## 6. Índice de verdade e de mentira

Arquivo: `src/lib/score.ts`. Fórmula em uma linha:

\[
\text{índice de verdade} = 100 \times \frac{\sum w_i}{n}
\quad\text{onde } w \in \{1,\;0{,}5,\;0\}
\]

| Selo canônico | Peso \(w\) | Leitura |
| --- | --- | --- |
| `verdadeiro` | 1 | a mesa sustentou a fala |
| `contexto`, `exagerado`, `impreciso` | 0,5 | no meio do caminho |
| `falso`, `insustentavel` | 0 | a mesa derrubou a fala |
| `inconclusivo` | *não entra* | ausência de juízo não puxa a média |

Índice de mentira = `100 − verdade`. Sem checagem com peso, os dois ficam em **zero** — não em 50. Zero aqui significa “ainda não há o que ponderar”, não “o candidato mentiu 0%”.

O índice é a **média dos selos das mesas**, não a média dos clusters. Uma fala checada por três mesas conta três vezes. Isso é deliberado: convergência de redações independentes pesa mais do que uma checagem isolada.

O painel também soma `convergencias` e `divergencias` dos clusters daquele candidato. São contagens de *como as mesas se organizaram*, não pesos extras na fórmula.

---

## 7. Estado, APIs e o que o público pode ver

Não há banco. `store.ts` guarda um `FeedResponse` na memória do processo. Reiniciar o Next.js zera o cache (salvo o arquivo offline).

| Rota | Verbo | Papel |
| --- | --- | --- |
| `/api/feed` | GET | Estado completo: clusters, índices, fontes, selo de cruzamento |
| `/api/sources` | GET | Só a saúde das mesas |
| `/api/refresh` | POST | Roda `runIngest` agora |
| `/api/crossing` | POST | Enfileira a IA; responde na hora |

`Cache-Control: no-store`. O feed não pode ficar 60 s no CDN com um selo velho.

Antes de sair para a internet, `sanitizePublicFeed` apaga qualquer vazamento de rede interna (endereços privados, porta do modelo, nome de host interno). A IA é **só servidor**, via `OLLAMA_HOST` / `OLLAMA_MODEL` em arquivo de ambiente com permissão restrita. Nunca `NEXT_PUBLIC_*` para isso.

O JSON público de cruzamento leva `promptVersion` (hoje `cross-v1`), `signature` (versão do lote de checagens) e `schemaVersion` (`1`). Host do modelo não entra. Lista de campos interno × público: [docs/schemas.md](./schemas.md). Política (versão do prompt, guardrails nomeados, o que é público): [docs/governanca-ia.md](./governanca-ia.md).

---

## 8. O que este desenho ensina (e o que ele não é)

Ensina:

- polling como substituto honesto de “tempo real” quando não há API;
- adaptador como fronteira entre o caos de cada site e um esquema único;
- similaridade de texto clássica (Jaccard) como primeiro cruzamento;
- ponderação explícita de selos para um índice auditável;
- IA como **editor de agrupamento**, não como oráculo de verdade;
- fallback determinístico para quando o modelo falha.

Não é:

- produto oficial do TSE, da Globo ou de campanha;
- um modelo que “detecta fake news” sozinho;
- um scraper que ignora o fato de o site ter bloqueado o HTML — nesse caso a fonte fica OFF.

---

## 9. Como reproduzir o raciocínio

1. Leia este arquivo até o fim.
2. Abra [Laboratório](/laboratorio) no site e o notebook.
3. No notebook, carregue `corpus_firecrawl.json` (como o coletor *vê* a página) e `checagens_debate.json` (o que o pipeline extraiu ao vivo).
4. Rode a captura → normalização → cluster → índice.
5. Rode o bloco da IA simulada duas vezes e compare os grupos. A diferença entre as rodadas *é* o conceito de não-determinismo.
6. Compare com `src/lib/cluster.ts`, `score.ts` e `ollama-crossing.ts`.

Se quiser estender o app: um adaptador novo é um arquivo em `src/lib/adapters/` registrado em `index.ts`. O restante — cluster, índice, painel — não muda.

---

## 10. Schemas, APIs e proteção do backend

O ensaio acima ensina o *porquê*. O **contrato** (campos reais, rotas, env, o que o JSON público pode vazar) mora na living spec GitHub Spec Kit:

- Repositório: [`.github/spec/spec.md`](../.github/spec/spec.md) · [plan.md](../.github/spec/plan.md) · [como agentes documentam](../.github/spec/agent-howto.md)
- No site: [`/laboratorio/spec/spec.md`](/laboratorio/spec/spec.md)

Tipos canônicos: `src/lib/types.ts` (`FeedItem`, `ClaimCluster`, `CandidateScore`, `SourceStatus`, `CrossingMeta`, `FeedResponse`, `ArchiveMeta`). Adaptador: `src/lib/adapters/types.ts`. Envelope Firecrawl e JSONs de ensino estão tabelados na spec — não os recopie aqui.

Proteção, em uma página:

- Superfície pública = túnel (`tunnel-edge`). Origem e modelo (`origin-app`, `llm-internal`) não entram em JS, JSON, HTML, README nem badge.
- Env do modelo só via `serverEnv` (`OLLAMA_HOST` / `OLLAMA_MODEL`). Nunca `NEXT_PUBLIC_*` para URL interna. Badge: «Consenso Ollama» + nome do modelo.
- `getFeed()` sempre passa por `sanitizePublicFeed` + `publicCrossing` (erro de fallback vira `"indisponível"`; `lastError` / `note` / banners suspeitos são redigidos).
- APIs: `Cache-Control: no-store, max-age=0`. Depois do cutoff, POST de captura/cruzamento responde 410 e o GET serve o arquivo.

Se um campo ou uma regra mudar no código, atualize a spec (e a cópia em `public/laboratorio/spec/`). Este ensaio só ganha um parágrafo.
