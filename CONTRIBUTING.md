# Contribuer à CryptoMeme

Merci de ton intérêt ! Idées de cryptos absurdes, équilibrage, bugs, nouvelles mécaniques : tout est bienvenu.

- **Une question ou une idée à débattre ?** Passe par les [Discussions](https://github.com/Itaromi/CryptoMeme/discussions).
- **Un bug ?** Ouvre une [issue](https://github.com/Itaromi/CryptoMeme/issues/new/choose).
- **Une modification à proposer ?** Ouvre une PR, en suivant les règles ci-dessous.

## Démarrer

Prérequis : Node 26 (`.nvmrc`, 22 minimum), pnpm 10, Docker.

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

## Utiliser l'IA

Les assistants IA (Copilot, ChatGPT, Claude…) sont autorisés. Quelques règles pour que ça reste utile :

- **Tu comprends ce que tu proposes.** Chaque ligne de ta PR doit pouvoir être expliquée par toi, pas par l'outil.
- **Tu relis et tu testes.** Le code généré passe `pnpm typecheck` et les tests, et tu l'as essayé dans le jeu.
- **Tu respectes les règles du projet.** L'IA ne connaît pas le grand livre : vérifie que l'argent et les actifs passent bien par `applyCash` / `applyAsset`.
- **Tu restes concis.** Pas de PR géante générée d'un coup, pas de description ou d'issue remplie de texte creux.
- **Tu le signales** dans la case prévue du modèle de PR.

Les PR visiblement générées sans relecture seront fermées.

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
