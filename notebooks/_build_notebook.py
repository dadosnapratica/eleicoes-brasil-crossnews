#!/usr/bin/env python3
"""Gera o notebook didático CrossNews. Rode: python3 notebooks/_build_notebook.py"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "crossnews_captura_cruzamento.ipynb"
PUB = ROOT.parent / "public" / "laboratorio"

COLAB_BADGE = "https://colab.research.google.com/assets/colab-badge.svg"
LAB_URL = "https://crossnews-debate-presidente-brasil-2026.ideiasfactory.tech/laboratorio"
DATA_URL = f"{LAB_URL}/data"
NOTEBOOK_URL = f"{LAB_URL}/crossnews_captura_cruzamento.ipynb"
# Colab abre um caderno em branco; o laboratório explica o upload.
# O próprio notebook baixa os JSONs do site público se os arquivos locais não existirem.
COLAB_OPEN = "https://colab.research.google.com/"

nb = {
    "nbformat": 4,
    "nbformat_minor": 5,
    "metadata": {
        "kernelspec": {
            "display_name": "Python 3",
            "language": "python",
            "name": "python3",
        },
        "language_info": {"name": "python", "pygments_lexer": "ipython3"},
        "colab": {"provenance": [], "toc_visible": True},
    },
    "cells": [],
}


def md(source: str) -> None:
    nb["cells"].append(
        {
            "cell_type": "markdown",
            "metadata": {},
            "source": [line + "\n" for line in source.strip("\n").split("\n")],
        }
    )


def code(source: str) -> None:
    nb["cells"].append(
        {
            "cell_type": "code",
            "metadata": {},
            "execution_count": None,
            "outputs": [],
            "source": [line + "\n" for line in source.strip("\n").split("\n")],
        }
    )


md(
    f"""
# Laboratório CrossNews — captura, cruzamento e índice de verdade

[![Abrir no Google Colab]({COLAB_BADGE})]({COLAB_OPEN})

**Como abrir no Colab em 30 segundos**

1. Baixe este arquivo: [{NOTEBOOK_URL}]({NOTEBOOK_URL})
2. Clique no selo laranja *Open in Colab* (ou vá a [colab.research.google.com]({COLAB_OPEN}))
3. Menu **Arquivo → Fazer upload do notebook** e escolha o `.ipynb`

Os dados vêm do site público. Você **não** precisa do repositório nem de GPU.

Guia teórico: [Arquitetura do CrossNews]({LAB_URL}) · texto completo em [`docs/arquitetura.md`]({LAB_URL}/arquitetura.md)

---

## O que você vai construir

Este caderno reproduz, em Python, o raciocínio do painel
[CrossNews](https://crossnews-debate-presidente-brasil-2026.ideiasfactory.tech):

1. **Captura** — como um dump Firecrawl vira texto e cards
2. **Selo** — como `#FAKE` e `Enganoso` viram um veredito canônico
3. **Cruzamento** — Jaccard + números para achar a *mesma* afirmação
4. **Índice** — média ponderada que vira verdade % e mentira %
5. **IA não determinística** — por que um modelo local pode agrupar diferente a cada rodada, sem inventar o selo

O CrossNews **não apura** se o candidato falou a verdade. Ele só cruza o que as mesas já publicaram.
"""
)

md(
    """
## 0. Ambiente

No Colab, `pandas` e `matplotlib` já estão instalados. Localmente: `pip install pandas matplotlib`.
"""
)

code(
    """
from __future__ import annotations

import json
import math
import random
import re
import unicodedata
import urllib.request
from collections import Counter
from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd

try:
    display  # IPython / Colab
except NameError:
    display = print

plt.rcParams.update({
    "figure.figsize": (9, 4.2),
    "axes.spines.top": False,
    "axes.spines.right": False,
    "axes.grid": True,
    "grid.alpha": 0.25,
    "font.size": 11,
})

PUBLIC_DATA = (
    "https://crossnews-debate-presidente-brasil-2026.ideiasfactory.tech"
    "/laboratorio/data"
)


def carregar_json(nome: str) -> dict:
    # Local primeiro (repo ou pasta data/); senao, baixa do site publico.
    candidatos = [
        Path("notebooks/data") / nome,
        Path("data") / nome,
        Path("/content") / nome,
        Path(".") / nome,
    ]
    for caminho in candidatos:
        if caminho.exists():
            print(f"arquivo local: {caminho}")
            return json.loads(caminho.read_text(encoding="utf-8"))
    url = f"{PUBLIC_DATA}/{nome}"
    print(f"baixando {url}")
    with urllib.request.urlopen(url, timeout=30) as resposta:
        return json.loads(resposta.read().decode("utf-8"))


firecrawl = carregar_json("corpus_firecrawl.json")
debate = carregar_json("checagens_debate.json")
print("fontes Firecrawl:", len(firecrawl["fontes"]))
print("checagens da noite:", len(debate["items"]))
print("debate:", debate["debate"])
"""
)

md(
    """
## 1. Captura: o que o Firecrawl enxerga

Antes de um adaptador existir, a equipe técnica precisa *ver* a página como um coletor vê. O Firecrawl devolve um envelope estável:

```json
{ "markdown": "...", "metadata": { "sourceURL": "...", "statusCode": 200 }, "links": [], "rawHtml": "..." }
```

- **markdown** — corpo limpo, bom para regex de selo
- **rawHtml** — obrigatório quando o dado útil está num `<script>` (caso UOL)
- **metadata** — URL, título, HTTP status

Isto é **reconhecimento**, não o loop de 30 s do app. Em produção o adaptador baixa a URL direto.
"""
)

code(
    """
linhas = []
for fonte in firecrawl["fontes"]:
    linhas.append({
        "mesa": fonte["mesa"],
        "http": fonte.get("statusCode"),
        "markdown_chars": fonte.get("markdown_chars"),
        "links": fonte.get("links_count"),
        "tem_rawHtml": "rawHtml" in (fonte.get("formato_firecrawl") or []),
        "url": fonte.get("sourceURL"),
    })
quadro_fontes = pd.DataFrame(linhas)
quadro_fontes
"""
)

md(
    """
### 1.1 Metodologia que o dump já entrega

O G1, no artigo da véspera, declara os três selos oficiais. Isso vira regra de `detectVerdict` — não opinião do agregador.
"""
)

code(
    """
g1 = next(f for f in firecrawl["fontes"] if f["arquivo"].startswith("g1"))
print(g1["title"])
print("-" * 60)
texto = g1["markdown_excerpt"]
for selo in ["#FATO", "#FAKE", "#NÃOÉBEMASSIM", "Fato ou Fake"]:
    print(f"{selo:20} ocorre {texto.count(selo)} vez(es) no recorte")
print()
# as frases que importam para o adaptador
for frase in re.findall(r".{0,40}#(?:FATO|FAKE|NÃOÉBEMASSIM).{0,40}", texto):
    print("·", frase.strip())
"""
)

md(
    """
### 1.2 UOL: o dado está no HTML, não no markdown

O Radar da Eleição hidrata a timeline com `<script id="VUELAND_STATE">`. O dump Firecrawl desta fonte trouxe `rawHtml`; o recorte didático já extraiu os cards. Em produção isso é `src/lib/adapters/uol.ts`.
"""
)

code(
    """
uol = next(f for f in firecrawl["fontes"] if f["arquivo"].startswith("uol"))
cards = uol.get("vueland_cards") or []
print(uol.get("nota"))
print(f"cards no dump da largada: {len(cards)}")
quadro_uol = pd.DataFrame(cards)
if not quadro_uol.empty:
    display_cols = [c for c in ["id", "author", "title", "type"] if c in quadro_uol.columns]
    display(quadro_uol[display_cols])
"""
)

md(
    """
Repare: este dump é da **largada** do debate (chegada ao estúdio, plateia, colunistas). Ainda quase não há selo de checagem. Isso é uma lição de captura em tempo real: o coletor precisa **voltar**. O arquivo `checagens_debate.json` é o produto dessas voltas — 68 checagens das mesas que publicaram ao vivo.
"""
)

md(
    """
## 2. Das páginas ao item padronizado

Cada adaptador devolve o mesmo formato, não importa se a origem foi RSS, blockquote ou JSON. Abaixo, as 68 checagens reais da noite (Estadão Verifica, Folha / Lupa, Terra / Aos Fatos). Cada linha tem URL da mesa — não é lote inventado.
"""
)

code(
    """
itens = debate["items"]
df = pd.DataFrame(itens)
print(debate["nota"])
print()
print(df.groupby(["sourceName", "verdict"]).size().unstack(fill_value=0))
print()
df[["sourceName", "candidate", "verdict", "originalVerdictLabel", "claim"]].head(8)
"""
)

md(
    """
### 2.1 Detectar o selo (porta de `verdict.ts`)

A mesa escreve `#FAKE`, `Enganoso`, `Falta contexto`. O agregador traduz para um selo canônico. O rótulo original é preservado para o cartão.
"""
)

code(
    r"""
REGRAS_SELO = [
    (r"#\s*fato\b", "verdadeiro", "#FATO"),
    (r"#\s*fake\b", "falso", "#FAKE"),
    (r"nao\s*e\s*bem\s*assim|#\s*naoebemassim", "contexto", "#NÃOÉBEMASSIM"),
    (r"\bsubestimado\b", "impreciso", "Subestimado"),
    (r"\bsuperestimado\b", "impreciso", "Superestimado"),
    (r"\benganoso\b", "falso", "Enganoso"),
    (r"\bverdadeiro\b|\be verdade\b", "verdadeiro", "Verdadeiro"),
    (r"\binsustentavel\b", "insustentavel", "Insustentável"),
    (r"\bfalso\b|\bfake news\b", "falso", "Falso"),
    (r"\bexagerado\b", "exagerado", "Exagerado"),
    (r"\bimpreciso\b|\bdistorcido\b", "impreciso", "Impreciso"),
    (r"falta(?:\s+de)?\s+contexto|fora de contexto", "contexto", "Falta contexto"),
    (r"\binconclusivo\b|\bnao comprovado\b", "inconclusivo", "Inconclusivo"),
]


def sem_acento(texto: str) -> str:
    nfd = unicodedata.normalize("NFD", texto)
    return "".join(ch for ch in nfd if unicodedata.category(ch) != "Mn")


def detectar_selo(texto: str) -> tuple[str, str] | None:
    bruto = texto.lower()
    if re.search(r"#\s*fato\b", bruto) or "#fato" in bruto:
        return "verdadeiro", "#FATO"
    if re.search(r"#\s*fake\b", bruto) or "#fake" in bruto:
        return "falso", "#FAKE"
    normal = re.sub(r"\s+", " ", sem_acento(texto).lower())
    for padrao, veredito, rotulo in REGRAS_SELO:
        if re.search(padrao, normal):
            return veredito, rotulo
    return None


exemplos = [
    "É #FAKE que Bolsonaro não debochou de pessoas com falta de ar",
    "O Estadão Verifica concluiu que é enganoso",
    "Folha / Lupa: falta contexto sobre a fome em 2012",
    "Aos Fatos: SUBESTIMADO — eram mais de 6 mil obras",
    "Opinião do colunista sobre o debate, sem selo",
]
for frase in exemplos:
    print(f"{detectar_selo(frase)!s:40} ← {frase}")
"""
)

md(
    """
## 3. Cruzamento heurístico (determinístico)

Duas mesas raramente copiam a frase uma da outra. “aumentou o Bolsa Família para R$ 600” e “o auxílio foi a 600 reais no governo Bolsonaro” são a *mesma* afirmação. O motor rápido usa:

1. **normalização** — minúsculas, sem acento, sem pontuação
2. **tokens** — palavras com mais de 2 letras, sem `de/que/para/…`
3. **Jaccard** = interseção / união
4. **overlap** = interseção / tamanho do menor conjunto
5. **números** — `6 mil`, `6.000` e `seis mil` viram `6000`

Casa se Jaccard ≥ 0,34 **ou** overlap ≥ 0,55, e o candidato for compatível. Mesmos itens → mesmos grupos, sempre.
"""
)

code(
    r"""
STOP = {
    "a", "ao", "aos", "as", "com", "como", "da", "das", "de", "do", "dos",
    "e", "em", "era", "foi", "mais", "mas", "na", "nao", "nas", "no", "nos",
    "o", "os", "ou", "para", "pela", "pelo", "por", "que", "se", "sem",
    "ser", "sua", "seu", "um", "uma", "ele", "ela",
}


def normalizar(texto: str) -> str:
    texto = sem_acento(texto).lower()
    texto = re.sub(r"https?://\S+", " ", texto)
    texto = re.sub(r"[^a-z0-9\s]", " ", texto)
    return re.sub(r"\s+", " ", texto).strip()


def tokenizar(texto: str) -> list[str]:
    return [t for t in normalizar(texto).split() if len(t) > 2 and t not in STOP]


def jaccard(a: list[str], b: list[str]) -> float:
    sa, sb = set(a), set(b)
    if not sa or not sb:
        return 0.0
    inter = len(sa & sb)
    return inter / (len(sa) + len(sb) - inter)


def overlap(a: list[str], b: list[str]) -> float:
    sa, sb = set(a), set(b)
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / min(len(sa), len(sb))


def numeros(texto: str) -> set[str]:
    n = sem_acento(texto).lower()
    n = re.sub(r"\b(\d{1,3}(?:[.\s]\d{3})+)\b", lambda m: m.group(0).replace(".", "").replace(" ", ""), n)
    n = re.sub(r"\b(\d+)\s*mil\b", lambda m: str(int(m.group(1)) * 1000), n)
    return {str(int(x)) for x in re.findall(r"\d{3,}", n) if int(x) != 0}


def similares(a: str, b: str) -> bool:
    ta, tb = tokenizar(a), tokenizar(b)
    if len(ta) < 3 or len(tb) < 3:
        return normalizar(a) == normalizar(b)
    return jaccard(ta, tb) >= 0.34 or overlap(ta, tb) >= 0.55


pares_demo = [
    (
        "foi o ex-presidente Jair Bolsonaro quem aumentou o Bolsa Família para R$ 600",
        "Jair Bolsonaro aumentou o Bolsa Família para 600 reais",
    ),
    (
        "quando assumiu o governo em 2023, encontrou 6 mil obras paralisadas",
        "Lula diz que achou seis mil obras paradas ao tomar posse",
    ),
    (
        "o governo Lula tem 11,5 mil obras paralisadas",
        "o governo Bolsonaro instalou 11,5 mil pontos de internet",
    ),
]
print(f"{'Jaccard':>8} {'overlap':>8} {'núm.':>6} {'casa?':>6}  afirmações")
for a, b in pares_demo:
    ta, tb = tokenizar(a), tokenizar(b)
    nums = numeros(a) & numeros(b)
    print(
        f"{jaccard(ta, tb):8.2f} {overlap(ta, tb):8.2f} {str(bool(nums)):>6} "
        f"{str(similares(a, b)):>6}  {a[:52]}…"
    )
"""
)

md(
    """
O terceiro par **compartilha o número 11500** mas fala de coisas diferentes (obras × internet). Por isso o código de produção exige tema comum (`obra`, `bolsa`, `fome`…) antes de casar só pelo número. Jaccard sozinho já recusa esse par — as palavras não se sobrepõem o bastante.
"""
)

code(
    """
def candidato_compativel(a: str, b: str) -> bool:
    if a in {"nenhum", "ambos"} or b in {"nenhum", "ambos"}:
        return True
    return a == b


def agrupar(checagens: list[dict]) -> list[list[dict]]:
    grupos: list[list[dict]] = []
    ordenados = sorted(checagens, key=lambda x: x.get("publishedAt") or "", reverse=True)
    for item in ordenados:
        colocado = False
        for grupo in grupos:
            semente = grupo[0]
            if not candidato_compativel(semente.get("candidate"), item.get("candidate")):
                continue
            mesmo = (
                similares(semente.get("claim") or "", item.get("claim") or "")
                or similares(semente.get("title") or "", item.get("title") or "")
                or similares(semente.get("claim") or "", item.get("title") or "")
            )
            if mesmo:
                grupo.append(item)
                colocado = True
                break
        if not colocado:
            grupos.append([item])
    return grupos


grupos = agrupar(itens)
print(f"{len(itens)} checagens → {len(grupos)} clusters")
print(f"clusters com 2+ mesas: {sum(1 for g in grupos if len({i['sourceId'] for i in g}) > 1)}")
print()
print("Maiores cruzamentos:")
for grupo in sorted(grupos, key=len, reverse=True)[:8]:
    mesas = ", ".join(
        f"{i['sourceName'].split('/')[0].strip()}:{i.get('originalVerdictLabel') or i['verdict']}"
        for i in grupo
    )
    print(f"  [{len(grupo)}] {grupo[0]['claim'][:78]}")
    print(f"       {mesas}")
"""
)

md(
    """
## 4. Consenso do cluster e índice de verdade / mentira

Cada selo cai num balde. Fato + fake no mesmo grupo vira **DIVERGENTE**. Só correção (impreciso / exagerado) sem um `#FATO` contrário vira **FAKE**.

O índice do candidato é a média dos **pesos dos selos**, não a média dos clusters:

| Selo | Peso |
| --- | --- |
| verdadeiro | 1,0 |
| contexto, exagerado, impreciso | 0,5 |
| falso, insustentável | 0,0 |
| inconclusivo | *fica de fora* |

Índice de mentira = `100 − verdade`. Sem checagem com peso, os dois ficam em **0** (nada a ponderar), não em 50.
"""
)

code(
    """
PESO = {
    "verdadeiro": 1.0,
    "contexto": 0.5,
    "exagerado": 0.5,
    "impreciso": 0.5,
    "falso": 0.0,
    "insustentavel": 0.0,
}


def balde(veredito: str | None) -> str:
    if veredito == "verdadeiro":
        return "fato"
    if veredito in {"falso", "insustentavel"}:
        return "fake"
    if veredito == "inconclusivo" or not veredito:
        return "inconclusivo"
    return "meio"


def consenso(grupo: list[dict]) -> dict:
    contas = Counter(balde(i.get("verdict")) for i in grupo)
    fato, fake, meio, inc = (contas.get(k, 0) for k in ("fato", "fake", "meio", "inconclusivo"))
    total = len(grupo)
    maior = max(fato, fake, meio, inc)
    if fato and fake:
        selo = "divergente"
    elif fato >= meio and fato >= inc and fato:
        selo = "fato"
    elif fake >= meio and fake >= inc and fake:
        selo = "fake"
    elif meio and not fato and not fake:
        duro = any(i.get("verdict") in {"impreciso", "exagerado"} for i in grupo)
        selo = "fake" if duro else "inconclusivo"
    else:
        selo = "inconclusivo"
    unidade = round(100 * maior / total) if total else 0
    penalidade = 35 if fato and fake else 0
    return {
        "consensus": selo,
        "consensusScore": max(0, min(100, unidade - penalidade)),
        "convergence": maior,
        "divergence": max(0, total - maior),
    }


def pontuar(checagens: list[dict], grupos: list[list[dict]]) -> pd.DataFrame:
    linhas = []
    for cand, nome in [("flavio_bolsonaro", "Flávio Bolsonaro"), ("lula", "Lula")]:
        relev = [
            i for i in checagens
            if i.get("verdict") and i.get("candidate") in {cand, "ambos"}
        ]
        pesos = [PESO[i["verdict"]] for i in relev if i["verdict"] in PESO]
        verdade = round(100 * sum(pesos) / len(pesos)) if pesos else 0
        rel_g = [g for g in grupos if g[0].get("candidate") in {cand, "ambos"}]
        linhas.append({
            "candidato": nome,
            "checagens": len(relev),
            "verdadeiro": sum(1 for i in relev if i["verdict"] == "verdadeiro"),
            "falso": sum(1 for i in relev if i["verdict"] in {"falso", "insustentavel"}),
            "outros": sum(1 for i in relev if i["verdict"] not in {"verdadeiro", "falso", "insustentavel"}),
            "truthIndex": verdade,
            "lieIndex": 0 if not pesos else 100 - verdade,
            "clusters": len(rel_g),
        })
    return pd.DataFrame(linhas)


clusters = []
for grupo in grupos:
    stats = consenso(grupo)
    clusters.append({
        "claim": max(grupo, key=lambda i: len(i.get("claim") or "")).get("claim"),
        "candidate": Counter(
            i["candidate"] for i in grupo if i["candidate"] not in {"ambos", "nenhum"}
        ).most_common(1)[0][0] if any(i["candidate"] not in {"ambos", "nenhum"} for i in grupo) else grupo[0]["candidate"],
        "n": len(grupo),
        "mesas": len({i["sourceId"] for i in grupo}),
        **stats,
        "selos": [i.get("originalVerdictLabel") or i.get("verdict") for i in grupo],
    })

placar = pontuar(itens, grupos)
print("Nosso placar (recalculado neste caderno):")
display(placar)
print()
print("Referência do painel ao vivo (mesma fórmula):")
display(pd.DataFrame(debate["scores_referencia"])[
    ["name", "checksTotal", "verdadeiro", "falso", "outros", "truthIndex", "lieIndex"]
])
"""
)

code(
    """
fig, eixos = plt.subplots(1, 2, figsize=(10.5, 4.2))

# índices
x = range(len(placar))
eixos[0].bar([i - 0.18 for i in x], placar["truthIndex"], width=0.36, color="#0b6b2c", label="verdade")
eixos[0].bar([i + 0.18 for i in x], placar["lieIndex"], width=0.36, color="#9b1c1c", label="mentira")
eixos[0].set_xticks(list(x), placar["candidato"])
eixos[0].set_ylim(0, 100)
eixos[0].set_ylabel("%")
eixos[0].set_title("Índice de verdade e mentira")
eixos[0].legend(frameon=False)

# consenso
contagem = Counter(c["consensus"] for c in clusters)
cores = {"fato": "#0b6b2c", "fake": "#9b1c1c", "divergente": "#b8860b", "inconclusivo": "#5c6778"}
rotulos = list(contagem)
eixos[1].bar(rotulos, [contagem[r] for r in rotulos], color=[cores[r] for r in rotulos])
eixos[1].set_title("Clusters por consenso")
eixos[1].set_ylabel("grupos")

fig.tight_layout()
plt.show()

print("Amostra de clusters cruzados (2+ mesas):")
cruzados = [c for c in clusters if c["mesas"] > 1]
pd.DataFrame(cruzados)[["consensus", "candidate", "n", "mesas", "selos", "claim"]].head(10)
"""
)

md(
    """
## 5. IA local não determinística

Até aqui tudo é função: mesmos itens, mesmos clusters, mesmo índice. Em produção existe um segundo motor — um modelo local (Ollama) no **servidor**. Ele só recebe `{id, mesa, candidato, selo, afirmação}` e devolve grupos. **Não cria selo.**

Um modelo generativo **amostra** o próximo token. `temperature` controla a aleatoriedade:

- `0` — quase sempre a mesma resposta (ainda não é hash)
- `0.1` — valor de produção: pouco ruído, útil em casos-limite
- `0.8` — criativo demais para mesa de checagem

Abaixo, um **editor simulado**: a similaridade vira probabilidade com temperatura. Duas rodadas do mesmo lote podem divergir. É isso que “não determinístico” significa na prática — sem chamar GPU.
"""
)

code(
    """
def similaridade_par(a: dict, b: dict) -> float:
    ta, tb = tokenizar(a.get("claim") or ""), tokenizar(b.get("claim") or "")
    base = max(jaccard(ta, tb), overlap(ta, tb))
    nums = numeros(a.get("claim") or "") & numeros(b.get("claim") or "")
    if nums:
        base = max(base, 0.62)
    if not candidato_compativel(a.get("candidate"), b.get("candidate")):
        return 0.0
    return base


def agrupar_com_temperatura(checagens: list[dict], temperature: float, seed: int) -> list[list[dict]]:
    # Mesmo guloso da producao: cada item tenta entrar no primeiro grupo compativel.
    # Temperatura baixa = limiar fixo 0.34 (deterministico).
    # Temperatura alta = o limiar "treme" e casos-limite mudam de grupo.
    rng = random.Random(seed)
    grupos: list[list[dict]] = []
    for item in checagens:
        colocado = False
        for grupo in grupos:
            s = similaridade_par(grupo[0], item)
            if s <= 0:
                continue
            if temperature <= 0.03:
                aceita = s >= 0.34
            else:
                t = max(0.02, temperature)
                aceita = rng.random() < 1 / (1 + math.exp(-(s - 0.34) / t))
            if aceita:
                grupo.append(item)
                colocado = True
                break
        if not colocado:
            grupos.append([item])
    return grupos


def resumo(grupos: list[list[dict]]) -> dict:
    return {
        "clusters": len(grupos),
        "cruzados": sum(1 for g in grupos if len({i["sourceId"] for i in g}) > 1),
        "maior": max(len(g) for g in grupos),
    }


print("Mesmo lote, três temperaturas, duas sementes cada:")
print(f"{'temp':>6} {'seed':>6} {'clusters':>10} {'cruzados':>10} {'maior':>8}")
for temp in (0.02, 0.10, 0.45):
    for seed in (1, 2):
        g = agrupar_com_temperatura(itens, temp, seed)
        r = resumo(g)
        print(f"{temp:6.2f} {seed:6d} {r['clusters']:10d} {r['cruzados']:10d} {r['maior']:8d}")

print()
print("Leitura: temp=0.02 e deterministico (sementes iguais). temp=0.45 treme o limiar.")
print("O selo de cada mesa nao muda — so o agrupamento.")
"""
)

code(
    """
# Caso-limite real: '6 mil obras' aparece com redações diferentes
obras = [
    i for i in itens
    if re.search(r"6\s*mil|seis mil|obras? parali", (i.get("claim") or "") + " " + (i.get("title") or ""), re.I)
]
print(f"checagens que falam de obras paralisadas / 6 mil: {len(obras)}")
for i in obras:
    print(f"  · [{i['sourceName']}] [{i.get('originalVerdictLabel')}] {i['claim'][:90]}")

print()
print("Heurística determinística agrupa assim:")
for g in agrupar(obras):
    print("  grupo:", [i["id"] for i in g])

print()
print("IA simulada (temp=0.45) em 5 sementes:")
for seed in range(5):
    g = agrupar_com_temperatura(obras, 0.45, seed)
    print(f"  seed {seed}: {[ [i['id'][-8:] for i in grp] for grp in g ]}")
"""
)

md(
    """
### 5.1 O que a IA de produção faz (e o que ela recusa)

No servidor, o prompt cabe em um parágrafo:

> Agrupe checagens que são A MESMA afirmação. Não junte afirmações distintas.
> Equivalências: "6 mil"="6.000"="seis mil". Sem número em comum, não agrupe.
> Não invente veredito, número nem fonte. Responda só JSON.

Salvaguardas que o caderno imita e o app reforça:

1. O modelo **não** recebe permissão para criar `verdict`.
2. O placar numérico é recalculado pela função heurística depois do agrupamento.
3. Se verdadeiro e um selo negativo caem no mesmo grupo, o consenso vira **DIVERGENTE**.
4. Se o modelo cair, estourar 45 s ou devolver JSON vazio, o painel permanece no consenso heurístico.
5. Host e porta do modelo **nunca** vão para o navegador. O selo público é “Consenso Ollama” + o nome do modelo.

Por isso dá para ensinar IA neste projeto sem fingir que um LLM é um detector de fake news.
"""
)

md(
    """
### 5.2 (Opcional) Gemini no Colab

Se você tiver uma chave, descomente o bloco. Sem chave, pule — o laboratório já demonstrou o não-determinismo. O prompt é o mesmo espírito do Ollama: **agrupar, não julgar**.
"""
)

code(
    """
# Opcional. No Colab: ícone de chave (Secrets) → GEMINI_API_KEY
# Sem chave, esta célula só imprime o pulo.

usar_gemini = False  # mude para True se quiser experimentar

if not usar_gemini:
    print("Gemini desligado. O bloco 5 já basta para o conceito.")
else:
    try:
        from google.colab import userdata  # type: ignore
        chave = userdata.get("GEMINI_API_KEY")
    except Exception:
        import os
        chave = os.environ.get("GEMINI_API_KEY")
    if not chave:
        print("Sem GEMINI_API_KEY — pulando.")
    else:
        import google.generativeai as genai
        genai.configure(api_key=chave)
        amostra = [
            {
                "id": i["id"],
                "mesa": i["sourceName"],
                "candidato": i["candidate"],
                "selo": i.get("originalVerdictLabel") or i["verdict"],
                "afirmacao": (i.get("claim") or "")[:180],
            }
            for i in itens[:12]
        ]
        prompt = (
            "Agrupe checagens que são A MESMA afirmação do debate da Globo. "
            "Não invente veredito. JSON: "
            '{"groups":[{"itemIds":["id"],"canonicalClaim":"...","justification":"..."}]}\\n'
            + json.dumps(amostra, ensure_ascii=False)
        )
        modelo = genai.GenerativeModel("gemini-2.0-flash")
        for rodada in (1, 2):
            resp = modelo.generate_content(
                prompt,
                generation_config={"temperature": 0.4, "response_mime_type": "application/json"},
            )
            print(f"\\n--- rodada {rodada} ---")
            print(resp.text[:900])
"""
)

md(
    """
## 6. De volta ao app

O que você rodou aqui mapeia assim:

| Neste caderno | No repositório |
| --- | --- |
| envelope Firecrawl | `.firecrawl/*.json` (reconhecimento) |
| `detectar_selo` | `src/lib/verdict.ts` |
| `similares` / `agrupar` | `src/lib/normalize.ts` + `cluster.ts` |
| `pontuar` | `src/lib/score.ts` |
| `agrupar_com_temperatura` | metáfora de `src/lib/ollama-crossing.ts` |
| loop 30 s + painel 10 s | `src/lib/ingest.ts` + `Dashboard.tsx` |

Três regras para levar:

1. **Tempo real**, neste domínio, é polling honesto + filtro da noite — não um soquete mágico.
2. **Índice** é média ponderada de selos alheios. Sem selo, zero. Sem mesa no ar, espaço vazio.
3. **IA** agrupa texto. Veredito continua sendo da redação humana que publicou o link.

Próximo passo: ler [`docs/arquitetura.md`](https://crossnews-debate-presidente-brasil-2026.ideiasfactory.tech/laboratorio/arquitetura.md) e abrir um adaptador em `src/lib/adapters/`. Um conector novo é um arquivo; cluster e índice não mudam.
"""
)


def _trim_sources(cells):
    for cell in cells:
        src = cell["source"]
        if src and src[-1].endswith("\n"):
            src[-1] = src[-1][:-1] if src[-1] != "\n" else src[-1]


_trim_sources(nb["cells"])
# keep trailing newline on last line of each cell for nbformat friendliness
for cell in nb["cells"]:
    if cell["source"] and not cell["source"][-1].endswith("\n"):
        cell["source"][-1] += "\n"

OUT.write_text(json.dumps(nb, ensure_ascii=False, indent=1), encoding="utf-8")
PUB.mkdir(parents=True, exist_ok=True)
(PUB / OUT.name).write_text(OUT.read_text(encoding="utf-8"), encoding="utf-8")
print("wrote", OUT, "cells", len(nb["cells"]))
print("copied", PUB / OUT.name)
