# Governança da IA no CrossNews

A IA do CrossNews é um **editor de agrupamento**, não um oráculo de verdade. Este texto explica, em tom de redação, o que o modelo pode e não pode fazer, como versionamos prompt e dados, quais guardrails existem no código, e o que o público vê versus o que fica só no servidor.

Leia junto: [schemas.md](./schemas.md) (interno × público) · [arquitetura.md](./arquitetura.md) · código em `src/lib/ai-governance.ts`.

---

## 1. O papel da IA (e o que ela não é)

No debate, quatro ou cinco mesas publicam selos diferentes para a *mesma* fala («Bolsa Família de R$ 600» × «o auxílio foi a 600 reais»). O motor rápido (Jaccard, determinístico) junta o óbvio em menos de um segundo. O motor lento (`refineClustersWithOllama`) pede a um modelo **local** que releia o lote e agrupe redações equivalentes.

O modelo **não apura** se o candidato falou a verdade. Isso continua sendo da mesa. O CrossNews só:

1. compacta `{ id, mesa, candidato, selo, afirmação }`;
2. pede JSON de grupos;
3. reconstrói clusters a partir dos `itemIds` que já existiam;
4. **recalcula** convergência, divergência e score com a função heurística;
5. força **DIVERGENTE** se verdadeiro e um selo negativo caem no mesmo grupo.

Se o modelo cair, estourar o tempo ou devolver lixo, o painel permanece no consenso heurístico. Nunca fica em branco esperando GPU.

---

## 2. Versionamento

Três números convivem no `CrossingMeta` e no `FeedResponse`:

| Campo | O que versiona | Hoje |
| --- | --- | --- |
| `promptVersion` | Texto do sistema/usuário + temperatura + `num_predict` + timeout | `cross-v1` |
| `signature` | Lote de entrada (ids de factcheck ordenados) | string `id1\|id2\|…` |
| `schemaVersion` | Contrato do JSON público | `1` |

`PROMPT_VERSION` vive em `src/lib/ai-governance.ts`. `SCHEMA_VERSION` vive em `src/lib/types.ts` (reexportado pela governança). `signature` é `fingerprintFactChecks` em `cluster.ts`.

### Como subir `PROMPT_VERSION`

Mude o texto **e** o número **no mesmo commit**. Se só o texto mudar, o painel mentiria sobre qual prompt produziu o agrupamento.

1. Edite `SYSTEM_PROMPT` e/ou `buildUserPrompt` (e, se for o caso, `CROSSING_TEMPERATURE`, `CROSSING_NUM_PREDICT`, `CROSSING_TIMEOUT_MS`).
2. Troque `PROMPT_VERSION` — semver curto (`cross-v2`) ou data+hash (`cross-2026-10-24`). O token público precisa casar `^[a-z0-9][a-z0-9._-]{1,31}$`.
3. Atualize este arquivo e o exemplo em `docs/schemas.md`.
4. Não coloque host, IP ou URL no prompt versionado (o texto vai para o modelo, não para o cliente — mas o hábito evita vazamento em log).

`schemaVersion` sobe quando o **JSON público** ganha ou perde campo. Não sobe só porque o prompt mudou.

`signature` muda sozinha quando uma mesa publica (ou some) uma checagem. A ingestão reusa o cruzamento `ready`/`ollama` se a assinatura for a mesma.

---

## 3. Guardrails (código, não só política)

As regras têm **nome**. O JSON público lista os ids aplicados em `crossing.guardrails`. Funções em `src/lib/ai-governance.ts`; chamada em `ollama-crossing.ts` / `offline.ts`.

| Id | Função | O que faz |
| --- | --- | --- |
| `json-only` | `guardJsonOnly` / `parseModelGroups` | Recusa texto que não seja um objeto com `groups[]`. Sem JSON válido → fallback heurístico. |
| `allowlist-enums` | `guardAllowlistGroup` | `consensus` ∈ fato/fake/divergente/inconclusivo; `candidate` ∈ flavio_bolsonaro/lula/ambos/nenhum; `justification` ≤ 280. Fora da lista → `inconclusivo` / `nenhum`. |
| `no-unknown-ids` | `guardKnownItemIds` | Ignora `itemIds` que o modelo inventou. Sem membros conhecidos, o grupo some. |
| `no-invented-verdict` | `guardNoInventedVerdict` | O modelo **nunca** escreve `FeedItem.verdict`. O selo continua sendo o da mesa. |
| `heuristic-score` | `guardHeuristicScore` | Recalcula `convergenceCount`, `divergenceCount`, `consensusScore`, `latestAt` com `clustersFromGroups`. O placar numérico não é do modelo. |
| `force-divergente` | `guardForceDivergente` | Se o grupo tem `verdadeiro` **e** um selo que não é verdadeiro nem inconclusivo, o consenso vira `divergente`. |
| `timeout-fallback` | `refineClustersWithOllama` | 45 s no chat; tags em 4 s; erro, host ausente ou `groups` vazio → `clusterFactChecks` + `status: "fallback"`. |
| `public-sanitize` | `publicCrossing` / `sanitizePublicFeed` | Lista branca do cruzamento; `error` público é sempre `"indisponível"`; `lastError`/`note`/banners suspeitos são redigidos. |

O prompt também pede, em português: «Não invente veredito, número nem fonte. Responda só JSON.» Isso é instrução. Os guardrails são a cerca.

Parâmetros de produção (versionados com o prompt):

- temperatura `0.1`
- `num_predict` `900`
- `format: "json"`
- timeout do chat `45_000` ms
- lotes de até 12 itens, concorrência 2, separados por candidato

---

## 4. Rastreabilidade (auditoria sem vazar infra)

Um cruzamento pronto leva o suficiente para alguém perguntar *quem agrupou o quê, com qual prompt, em cima de qual lote*:

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

O badge do painel (`CrossingBadge`) mostra «Consenso Ollama · *nome* · *promptVersion*». Sem host.

### O que é público × o que é só servidor

| Público (`tunnel-edge`) | Só servidor (`origin-app` / `llm-internal`) |
| --- | --- |
| `status`, `engine`, `model` (nome), `promptVersion`, `signature`, `schemaVersion`, `updatedAt`, `guardrails` | `OLLAMA_HOST`, URL de chat/tags, IP, porta |
| `error: "indisponível"` em fallback | texto cru de timeout, DNS, curl |
| clusters com selos **das mesas** | corpo do pedido/resposta do modelo |
| URLs das matérias (`sourceUrl`) | dumps Firecrawl, env interna |

`publicCrossing` **não** tem campo de host. Se `model` parecer caminho ou URL, o campo some. Se `promptVersion` não casar o regex seguro, some.

---

## 5. Como o fluxo aplica as regras

```text
lote de factchecks  →  compactItems
        ↓
SYSTEM_PROMPT + buildUserPrompt   (PROMPT_VERSION)
        ↓
chat (45 s, temperature 0.1, format json)
        ↓
parseModelGroups  →  json-only + allowlist-enums
        ↓
applyGroups
   · known itemIds
   · nunca escreve item.verdict
   · heuristic-score
   · force-divergente
        ↓
CrossingMeta via crossingAudit
        ↓
sanitizePublicFeed  →  GET /api/feed
```

`POST /api/crossing` **não espera** o modelo. Devolve o feed (`pending`) e o trabalho segue em segundo plano. O túnel público encerraria a requisição se o servidor ficasse parado nos lotes.

---

## 6. O que isto ensina

- Uma política de IA sem função no código é um cartaz. Cada regra aqui tem nome e endereço.
- Versionar o prompt é tão importante quanto versionar o schema: sem isso, ninguém reproduz um agrupamento.
- Fallback determinístico é parte da governança, não um plano B envergonhado.
- Rastrear sem vazar: o eleitor pode saber *qual modelo* e *qual prompt*; não precisa (nem deve) saber *onde* o processo fala com a GPU.
