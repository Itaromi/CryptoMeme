# Contribuer à CryptoMeme

Merci de ton intérêt ! Idées de cryptos absurdes, équilibrage, bugs, nouvelles mécaniques : tout est bienvenu.

## Démarrer

Prérequis : Node 22 (`.nvmrc`), pnpm 10, Docker.

```bash
pnpm install
pnpm db:up
cp apps/api/.env.example apps/api/.env
pnpm --filter @cryptomeme/api exec prisma migrate dev
pnpm db:seed
pnpm dev
```

Le jeu tourne sur http://localhost:3000, les e-mails de dev arrivent sur http://localhost:8025.

## Avant d'ouvrir une PR

```bash
pnpm typecheck
pnpm --filter @cryptomeme/engine test
```

- Une PR = un sujet. Explique le *pourquoi* dans la description.
- Toute variation de cash ou d'actif **doit** passer par le grand livre (`applyCash` / `applyAsset`) dans une transaction : c'est la règle d'or de l'économie du jeu (voir [docs/SPEC.md](docs/SPEC.md)).
- Une modification du schéma Prisma vient avec sa migration (`prisma migrate dev --name …`).
- Les textes du jeu sont en français, sur un ton « mème » mais lisible.
- Les icônes viennent de [Phosphor](https://phosphoricons.com) ; ajoute-les à `ICON_GROUPS` dans `packages/shared`.

## Organisation du code

| Dossier | Rôle |
|---|---|
| `packages/engine` | Moteur économique pur (AMM, prix PNJ, minage, actions), testé avec Vitest |
| `packages/shared` | Schémas Zod, constantes et icônes partagés |
| `apps/api` | NestJS + Prisma : auth, grand livre, marché, minage, Bourse, événements, méta, créations |
| `apps/web` | Next.js : toutes les pages du jeu |
| `deploy` | Pile Docker de production (Caddy, Postgres, sauvegardes) |

## Signaler une faille

Pas d'issue publique : voir [SECURITY.md](SECURITY.md).
