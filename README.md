# CrossNews · Debate Presidencial Globo

Painel jornalístico (não partidário) que cruza, em tempo quase real, **checagens** do debate de 2º turno da Rede Globo entre **Flávio Bolsonaro (PL)** e **Lula (PT)**.

O CrossNews **não inventa vereditos**. Só exibe o que as mesas publicaram, com atribuição e link para o original. Não há modo demo nem lote simulado.

## Como rodar

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

```bash
npm run build
npm start
```

Não há autenticação. O armazenamento da v1 é em memória no processo do Next.js.

## O que você vê

A home mostra só **declarações checadas**:

- Índices de verdade e mentira dos dois candidatos (agregação das mesas)
- Cada afirmação uma vez, com o selo de cada mesa lado a lado
- Convergência / divergência e consenso FATO / FAKE / DIVERGENTE / INCONCLUSIVO
- Se uma mesa ainda não publicou, o espaço fica em “Aguardando checagens desta fonte”

## Fontes oficiais desta noite

| Mesa | URL identificada |
| --- | --- |
| **G1 Fato ou Fake** | [Metodologia](https://g1.globo.com/fato-ou-fake/eleicoes/noticia/2026/10/22/saiba-como-o-fato-ou-fake-checara-declaracoes-dos-candidatos-no-debate-de-2-turno-da-globo.ghtml) · [listagem Eleições](https://g1.globo.com/fato-ou-fake/eleicoes/) · RSS `https://g1.globo.com/rss/g1/fato-ou-fake/` |
| **UOL Confere / Radar** | [Radar da Eleição](https://noticias.uol.com.br/ao-vivo/2026/10/23/radar-da-eleicao-lula-e-flavio-debatem-na-globo-uol-confere-faz-checagem.htm) — JSON `#VUELAND_STATE` |
| **Terra / Aos Fatos** | [Anúncio Terra](https://www.terra.com.br/noticias/eleicoes/terra-e-aos-fatos-farao-checagem-em-tempo-real-do-debate-final-entre-flavio-e-lula-na-globo,0926a643fcdeaefbd0b8647dfe2279813dfz965h.html) · [Checamos o debate](https://www.aosfatos.org/noticias/checamos-flavio-bolsonaro-lula-debate-globo/) |
| **Folha / Agência Lupa** | [Anúncio Folha](https://www1.folha.uol.com.br/poder/2026/10/folha-e-agencia-lupa-farao-checagem-ao-vivo-durante-debate-da-tv-globo.shtml) · [Folha Ao Vivo](https://aovivo.folha.uol.com.br/poder/2026/10/23/6566-flavio-bolsonaro-e-lula-participam-de-ultimo-debate-das-eleicoes-na-globo-acompanhe.shtml) · [Lupa](https://lupa.uol.com.br/) |
| **Estadão Verifica** | [Checagem ao vivo do debate](https://www.estadao.com.br/estadao-verifica/debate-tv-globo-checagem-tempo-real-ao-vivo/) |
| **AFP Chegamos** | [Checamos](https://checamos.afp.com/) · [Eleições 2026](https://checamos.afp.com/list/Eleicoes-2026) — sem live do debate da Globo até agora |
| **Projeto Comprova** | [Plantão do debate](https://projetocomprova.com.br/publica%C3%A7%C3%B5es/projeto-comprova-anuncia-plantao-especial-para-o-debate-na-tv-globo-e-fim-de-semana-eleitoral-e-reforca-servico-consulte-o-comprova/) · [Publicações](https://projetocomprova.com.br/) |

## Documentação

| Recurso | O que é |
| --- | --- |
| [docs/arquitetura.md](docs/arquitetura.md) | Guia didático: captura, cruzamento e índice |
| [docs/schemas.md](docs/schemas.md) | Campos internos × JSON público |
| [docs/governanca-ia.md](docs/governanca-ia.md) | Política da IA: versão de prompt/dados, guardrails, rastreio |
| [docs/git.md](docs/git.md) | Como publicar o código no git |
| [`.github/spec/spec.md`](.github/spec/spec.md) | Spec Kit: produto, schemas, APIs, segurança |
| [`.github/spec/plan.md`](.github/spec/plan.md) | Spec Kit: stack e bibliotecas |
| [`.github/spec/agent-howto.md`](.github/spec/agent-howto.md) | Spec Kit: como manter a árvore |
| [notebooks/crossnews_captura_cruzamento.ipynb](notebooks/crossnews_captura_cruzamento.ipynb) | Caderno Jupyter (captura → selo → Jaccard → índice) |

No Colab: baixe o `.ipynb` → [colab.research.google.com](https://colab.research.google.com/) → **Arquivo → Fazer upload do notebook**. Os JSONs vêm do site público. Sem GPU, sem chave, sem repositório.

Cópia pública (só `tunnel-edge`):

- [Laboratório](https://crossnews-debate-presidente-brasil-2026.ideiasfactory.tech/laboratorio)
- [spec/](https://crossnews-debate-presidente-brasil-2026.ideiasfactory.tech/laboratorio/spec/)
- [schemas.md](https://crossnews-debate-presidente-brasil-2026.ideiasfactory.tech/laboratorio/schemas.md)
- [governanca-ia.md](https://crossnews-debate-presidente-brasil-2026.ideiasfactory.tech/laboratorio/governanca-ia.md)
- [arquitetura.md](https://crossnews-debate-presidente-brasil-2026.ideiasfactory.tech/laboratorio/arquitetura.md)

## Licença

[LICENSE](LICENSE) — Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0): uso e modificação livres; atribuição; vedado uso comercial; derivações na mesma licença. [creativecommons.org/licenses/by-nc-sa/4.0/](https://creativecommons.org/licenses/by-nc-sa/4.0/)

## Arquitetura

Tipos em `src/lib/types.ts`. JSON público passa por `sanitizePublicFeed` / `publicCrossing`. Host do modelo só em env server-only (`origin-app` → `llm-internal`). Superfície pública = `tunnel-edge`. Sem `NEXT_PUBLIC_*` para URL interna. Detalhe na spec, não neste README.

- Next.js (App Router) + TypeScript + Tailwind CSS
- Adaptadores em `src/lib/adapters`
- Clusterização heurística imediata; cruzamento semântico assíncrono (`llm-internal`, se disponível)
- `GET /api/feed` · `GET /api/sources` · `POST /api/refresh` · `POST /api/crossing`
- Ingestão no primeiro request + a cada 30s; o cliente consulta `/api/feed` a cada 10s

## Pontuação

- verdadeiro = 1
- contexto / exagerado / impreciso = 0,5
- falso / insustentável = 0
- inconclusivo não entra

Índice de verdade = média ponderada × 100. Sem checagens ao vivo, os índices ficam em zero.

## Limitações

- Sem banco pago: reiniciar o servidor zera o cache.
- Sites podem bloquear o HTML; nesse caso a fonte fica OFF, sem cartões inventados.
- A clusterização heurística é o caminho rápido; o consenso semântico roda em segundo plano quando o Ollama local está no ar.
- Isto **não** é produto eleitoral oficial.

## Publicar no Git

O código pode ir para um git host; a superfície pública continua **só** o Cloudflare Tunnel. Nunca commitar `.env*` (exceto `.env.example`), cache Firecrawl, snapshot offline, chaves ou endereços internos.

Passo a passo (remote, o que entra, primeiro commit): [docs/git.md](docs/git.md).
