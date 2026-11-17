<div align="center">

# Crypto**Meme**

**Achète haut. Vends bas.**

Jeu de trading multijoueur de cryptos et d'actions **100 % fictives** : marché vivant, traders PNJ, rug pulls, minage, Bourse, événements absurdes et classement par saison.

*A multiplayer trading game with fake meme coins and parody stocks, built in French.*

[![CI](https://github.com/Itaromi/CryptoMeme/actions/workflows/ci.yml/badge.svg)](https://github.com/Itaromi/CryptoMeme/actions/workflows/ci.yml)
[![Images Docker](https://github.com/Itaromi/CryptoMeme/actions/workflows/docker.yml/badge.svg)](https://github.com/Itaromi/CryptoMeme/actions/workflows/docker.yml)
[![CodeQL](https://github.com/Itaromi/CryptoMeme/actions/workflows/codeql.yml/badge.svg)](https://github.com/Itaromi/CryptoMeme/actions/workflows/codeql.yml)
[![Licence MIT](https://img.shields.io/badge/licence-MIT-e4ef3a)](LICENSE)

**[Jouer → cryptomeme.younsylvestre.fr](https://cryptomeme.younsylvestre.fr)**

</div>

---

Chaque joueur démarre la saison avec 10 000 $ fictifs. À la fin, une seule personne est #1. Entre les deux : des cryptos qui s'appellent Bitconnard ou RugPull Inu, des PNJ qui paniquent, des rigs qui prennent feu, la flat tax qui tombe sans prévenir, et des OPA sur Leroy Merdelin.

## Ce qu'il y a dedans

| | |
|---|---|
| **Marché crypto** | Prix sur AMM (x·y=k) : chaque ordre fait bouger le cours. Traders PNJ (valeur juste Ornstein-Uhlenbeck, régimes calme / hype / panique, sauts), rug pulls, slippage affiché avant l'ordre, bougies en temps réel. |
| **Bourse** | 12 sociétés parodiques, cotation de 9 h à 22 h avec gaps à l'ouverture, résultats trimestriels contre le consensus, dividendes, brèves, OPA, faillites, splits. |
| **Minage** | ~400 composants (CPU, GPU, ASIC, alims, refroidissement, racks), locaux, 4 réseaux avec halving, pools PPS / PPLNS / Solo / louches, électricité, usure, pannes, incendies. |
| **Banques** | 5 banques fictives : frais, intérêts, remise électricité, assurance, bouclier fiscal… et risque de faillite. |
| **Événements** | 19 types (flat tax, impôt sur les riches, piratage, héritage, krach, canicule, pénurie de GPU…), avec préavis et notifications. |
| **Méta** | Boutique de cosmétiques (cadres, bannières, titres, badges, effets de pseudo), 30 succès, 7 classements, statistiques avancées (Sharpe, drawdown, carte de chaleur…). |
| **Création** | Lance ta crypto, introduis ton entreprise en Bourse ou monte ton pool de minage — modéré, liquidité verrouillée, part du créateur en vesting, royalties. |

## Une économie qui ne se laisse pas tricher

- **Grand livre en partie double** : toute variation de cash ou d'actif est une écriture `LedgerEntry`, en transaction avec verrous de ligne. Somme du grand livre = solde, toujours.
- **Patrimoine = valeur de revente réelle** (slippage inclus) : impossible de gonfler son classement sur une coin illiquide.
- Pas de transferts entre joueurs, ordres idempotents, cooldown, limitation de débit par IP réelle.
- Les royalties et commissions sont prélevées sur des frais existants : aucun argent n'est créé à partir de rien.
- Toute action admin exige un motif et est journalisée.

## Stack

TypeScript de bout en bout, monorepo **pnpm + Turborepo**.

| Dossier | Rôle |
|---|---|
| [`packages/engine`](packages/engine) | Moteur économique pur et testé (AMM, prix PNJ, minage, actions) — Vitest |
| [`packages/shared`](packages/shared) | Schémas Zod, constantes, icônes partagés front/back |
| [`apps/api`](apps/api) | **NestJS 11** + **Prisma 6** / PostgreSQL 16, Socket.IO, tâches planifiées sous bail |
| [`apps/web`](apps/web) | **Next.js 15**, TanStack Query, lightweight-charts, Tailwind v4, Phosphor Icons |
| [`deploy`](deploy) | Pile Docker de production : Caddy, Postgres, sauvegardes quotidiennes |

## Démarrer en local

Prérequis : Node 26 (`.nvmrc`, 22 minimum), pnpm 10, Docker.

```bash
pnpm install
pnpm db:up                                   # Postgres (5434) + Mailpit (http://localhost:8025)
cp apps/api/.env.example apps/api/.env
pnpm --filter @cryptomeme/api exec prisma migrate dev
pnpm db:seed                                 # cryptos, sociétés, catalogue, banques, succès, admin
pnpm dev                                     # API :4000 + site :3000
```

- Jeu : http://localhost:3000
- E-mails de dev : http://localhost:8025
- Admin de dev : `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` dans `apps/api/.env`

Vérifications :

```bash
pnpm typecheck
pnpm --filter @cryptomeme/engine test
pnpm --filter @cryptomeme/engine simulate 30 7   # simule 7 jours de marché
```

## Déployer

Images Docker publiées sur GHCR à chaque push sur `main` :
`ghcr.io/itaromi/cryptomeme-api` et `ghcr.io/itaromi/cryptomeme-web`.

```bash
cd deploy && cp .env.example .env   # secrets, Resend, URL publique
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec api node_modules/.bin/tsx prisma/seed.ts
```

Guide complet (NAS, tunnel Cloudflare, e-mails Resend, mises à jour, sauvegardes) : **[docs/DEPLOY.md](docs/DEPLOY.md)**.

## Documentation

- [docs/SPEC.md](docs/SPEC.md) — conception complète du jeu et de son économie
- [docs/DEPLOY.md](docs/DEPLOY.md) — mise en production
- [CONTRIBUTING.md](CONTRIBUTING.md) — contribuer
- [SECURITY.md](SECURITY.md) — signaler une faille

## Communauté

Questions, idées de cryptos absurdes, captures de tes meilleurs trades : tout se passe dans les **[Discussions](https://github.com/Itaromi/CryptoMeme/discussions)**. Les bugs vont dans les [issues](https://github.com/Itaromi/CryptoMeme/issues).

## Licence

[MIT](LICENSE). Toutes les cryptos, sociétés, banques et personnes du jeu sont fictives ou parodiques ; aucun argent réel n'est en jeu.
