# How-to: documentar o CrossNews neste formato (para agentes)

Esta árvore é a **living spec** do app (modelo GitHub Spec Kit / spec-driven development, 2025–2026). O código serve a spec; a spec descreve o contrato. Quando o TypeScript e a spec divergem, **corrija a spec para o código real** — nunca invente campo para “completar” o documento.

## Onde mora o quê

| Artefato | Papel | Quem atualiza |
| --- | --- | --- |
| `.github/spec/spec.md` | Produto, user stories, FR/SC, **schemas**, APIs, segurança, env | Agente que mudar tipo, rota ou regra de proteção |
| `.github/spec/plan.md` | Arquitetura, mapa de pastas, **bibliotecas e o porquê** | Agente que mudar stack, import ou desenho |
| `.github/spec/agent-howto.md` | Este guia | Só se o processo de documentação mudar |
| `public/laboratorio/spec/*` | Cópia pública (túnel) dos três arquivos acima | Sempre que `.github/spec/` mudar — **copiar, não reescrever** |
| `docs/arquitetura.md` + `public/laboratorio/arquitetura.md` | Ensaio de ensino (iniciante → intermediário) | Ponteiro curto + fato novo; **não** colar a spec inteira |
| `src/app/laboratorio/page.tsx` | Guia curto na UI | Uma seção / um link quando o contrato ganhar superfície nova |
| `README.md` | Onboarding | Um pointer para `.github/spec/` |
| `src/lib/types.ts` e `src/app/api/*` | Fonte canônica dos campos | Código primeiro; spec em seguida |

Não há `tasks.md` nesta living spec. Use `tasks.md` **só** em feature branches (abaixo).

## Loop Spec Kit neste repositório

Para **mudança de comportamento** ( Spec Kit *living spec* + *evolving specs*):

```text
1. specify   →  deixe o contrato explícito em spec.md
2. plan      →  ajuste plan.md (stack, arquivos, libs)
3. tasks     →  se a mudança for grande, crie
               specs/NNN-titulo-curto/tasks.md
               (checklist `- [ ] T00N [P?] [USn] …` + path)
4. implement →  código em src/ (leia node_modules/next/dist/docs/)
5. converge  →  spec, plan e código batem; sem host interno
```

Para **feature nova isolada**, crie `specs/NNN-slug/` com `spec.md` + `plan.md` (+ `tasks.md` se útil). Ao aceitar a feature, **promova** o contrato estável de volta para `.github/spec/spec.md` (schemas/APIs/FR). Não deixe duas verdades.

Não instale o CLI do Spec Kit só para editar estes Markdown.

## Como documentar um schema

1. Abra `src/lib/types.ts` (e `src/lib/adapters/types.ts` se for adaptador).
2. Copie **somente** campos que existem. Marque opcionais com `?`.
3. Atualize a tabela correspondente em `spec.md` § Data schemas.
4. Se o campo entra no JSON público, diga se `sanitizePublicFeed` / `publicCrossing` o altera.
5. Se for envelope de ensino (notebook / Firecrawl), leia o JSON real em `notebooks/data/` — não o “formato ideal”.
6. Copie `.github/spec/spec.md` → `public/laboratorio/spec/spec.md`.

## Como documentar proteção do backend

Checklist mínimo (se qualquer um falhar, a mudança não está pronta):

- [ ] Nenhuma URL/IP/porta de `llm-internal` ou `origin-app` em cliente, API JSON, HTML, README, badge, DNS.
- [ ] Host do modelo só via `serverEnv("OLLAMA_HOST")` / `OLLAMA_MODEL`. Sem `NEXT_PUBLIC_*`.
- [ ] `getFeed()` ainda passa por `sanitizePublicFeed`.
- [ ] Rotas de API ainda mandam `Cache-Control: no-store, max-age=0`.
- [ ] Badge continua «Consenso Ollama» + nome do modelo.
- [ ] `.env.example` tem **placeholders** (`http://llm-internal`, `instruct-7b`, `G-XXXXXXXX`).
- [ ] A regex de vazamento de `offline.ts` **não** é republicada (ela cita padrões internos de propósito).
- [ ] Não rsync `.env*`.

Ao mudar essa superfície, atualize `spec.md` § Security e um parágrafo curto em `docs/arquitetura.md` (seção Schemas e proteção). Sem reescrever o ensaio.

## Como documentar uma biblioteca

Só entre em `plan.md` § Libraries se:

1. está em `package.json`, **ou**
2. é stdlib Node importada de `src/` (`node:fs`, `node:path`, `node:child_process`), **ou**
3. é built-in do Next realmente importado (`next/link`, `next/font/google`, `Metadata`).

Para cada uma, uma frase de **por que este app a usa**. Remova a linha se o import sumir. Não documente Firecrawl SDK, client Ollama, ORM ou axios — o app não os usa.

## Como **não** documentar infra

Use só nomes funcionais fictícios:

| Diga | Não diga |
| --- | --- |
| `tunnel-edge` | hostname de túnel interno, IPs, overlay |
| `origin-app` | nome de máquina, LAN, porta de origem |
| `llm-internal` | URL do modelo, porta, vendor de mesh |

O site público (humano) pode ser citado:  
`https://crossnews-debate-presidente-brasil-2026.ideiasfactory.tech`

## Ensino vs contrato

- **Contrato** (agentes implementam contra): `.github/spec/`.
- **Ensaio** (humanos aprendem captura / Jaccard / índice): `docs/arquitetura.md` + `/laboratorio`.
- **Caderno** (reproduzir o raciocínio): `notebooks/crossnews_captura_cruzamento.ipynb` + JSONs em `notebooks/data/`.

Se você adicionar um conceito de produto (ex.: novo campo em `FeedItem`), atualize o contrato **e** acrescente 2–4 frases no ensaio / laboratório. Não cole tabelas de schema no ensaio — aponte para `/laboratorio/spec/spec.md`.

## Deploy depois de documentar (regra do workspace)

1. `npm run build` se TSX/TS de `src/` mudou.
2. rsync `src`, `docs`, `.github/spec`, `public/laboratorio`, `README.md` para o `origin-app`. Não limpar scripts de start. Não rsync `.env*`.
3. No `origin-app`: `npm run build` e restart do serviço.
4. Confirmar `/laboratorio` e `/laboratorio/spec/spec.md` no hostname público.

## Definition of done para um agente de documentação

- [ ] Schemas batem com `types.ts` / rotas / JSON de ensino.
- [ ] Proteção do backend está na spec, sem mapa de rede.
- [ ] `plan.md` lista só libs reais.
- [ ] Cópias em `public/laboratorio/spec/` idênticas.
- [ ] Laboratório, arquitetura e README têm pointer (não ensaio duplicado).
- [ ] Grep nos artefatos públicos: nenhum IP privado, nenhuma porta de origem/modelo, nenhum nome de máquina interna.
