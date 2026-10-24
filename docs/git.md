# Publicar no Git

Preparação apenas. O primeiro commit, o remote e o push são manuais.

## Superfície pública

O site público passa **só** pelo Cloudflare Tunnel:

https://crossnews-debate-presidente-brasil-2026.ideiasfactory.tech

Nunca commitar, documentar ou publicar endereços internos, IPs privados, portas de origem ou nomes de hosts internos. Use nomes funcionais fictícios (`llm-internal`, `origin-app`, `tunnel-edge`) se precisar falar da topologia.

## O que entra no repositório

- `src/`, `public/` (Laboratório, favicon, fotos públicas)
- `docs/`, `notebooks/` (exceto cache `_build`)
- `spec/` e `.github/spec/` se existirem
- `scripts/freeze-offline.sh` (sem plists)
- `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`
- `.env.example` (placeholders)
- `README.md`, `AGENTS.md`, `.gitignore`
- `data/.gitkeep` e `public/offline/.gitkeep` (pastas vazias)

## O que nunca entra

| Caminho | Motivo |
| --- | --- |
| `node_modules/`, `.next/`, `out/`, `build/` | artefatos |
| `.env*` exceto `.env.example` | hosts reais, ID de analytics, segredos |
| `.firecrawl/` | cache bruto de scrape |
| `data/offline-snapshot.json`, `data/offline.lock`, `data/last-good-feed.json`, `data/*.dryrun.json` | arquivo da noite / último feed válido |
| `public/offline/*.png` | captura de tela local |
| `*.pem`, chaves, `*credentials*`, `secrets/` | credenciais |
| `.cursor/` | playbook de deploy com origem |
| `scripts/*.plist`, `start-prod.sh` | paths e launchd do host de origem |
| `.idea/`, `.vscode/`, `.DS_Store` | IDE / OS |

## Remote (quando você quiser)

Não crie o remote agora. Quando for publicar:

```bash
git remote add origin git@HOST:CONTA/eleicoes_brasil_fact_check_crossnews.git
git remote -v
```

Troque `HOST` e `CONTA` pelo GitHub, Origin ou outro git host. Depois `git push -u origin main` (ou `master`).

## Primeiro commit (quando você quiser)

Confira o que o Git vê, depois adicione só o conjunto abaixo:

```bash
git status
git add .gitignore .env.example README.md AGENTS.md
git add package.json package-lock.json tsconfig.json next.config.ts eslint.config.mjs
git add src public docs notebooks scripts/freeze-offline.sh
git add data/.gitkeep
# se o outro agente já tiver escrito:
# git add spec .github
git status
git commit -m "Initial commit: CrossNews debate fact-check panel."
```

Não rode `git add .` no primeiro commit sem reler `git status`. `.env.local` e `.env.production` têm de continuar invisíveis.

`src/lib/offline.ts` e `scripts/freeze-offline.sh` têm uma regex de bloqueio com nomes e portas internas. É lista de recusa (o feed público é sanitizado), não instrução de conexão.
