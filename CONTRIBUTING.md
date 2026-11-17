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
pnpm lint
pnpm typecheck
pnpm --filter @cryptomeme/engine test
```

La CI lance les mêmes commandes. `pnpm lint:fix` corrige automatiquement ce qui peut l'être.

- Une PR = un sujet. Explique le *pourquoi* dans la description.
- Toute variation de cash ou d'actif **doit** passer par le grand livre (`applyCash` / `applyAsset`) dans une transaction : c'est la règle d'or de l'économie du jeu (voir [docs/SPEC.md](docs/SPEC.md)).
- Une modification du schéma Prisma vient avec sa migration (`prisma migrate dev --name …`).
- Le site est bilingue : aucun texte en dur dans les composants. Chaque texte va dans `apps/web/messages/fr/<partie>.json` **et** `apps/web/messages/en/<partie>.json` (mêmes clés), et s'affiche avec `useTranslations`. Le ton reste « mème » mais lisible, dans les deux langues. Une clé manquante en anglais fait échouer le typecheck.
- Côté site, les montants, prix et dates passent par `useFormat()` (`apps/web/lib/format.ts`), les clés de requêtes par `queryKeys` et les actions par `useApiMutation`.
- Les icônes viennent de [Phosphor](https://phosphoricons.com) ; ajoute-les à `ICON_GROUPS` dans `packages/shared`.

## Labels

Les issues et les PR sont triées avec trois familles de labels :

| Famille | Exemples | Sert à |
|---|---|---|
| `type:` | `type: bug`, `type: idée`, `type: équilibrage`, `type: refacto`, `type: docs` | La nature du travail |
| `zone:` | `zone: marché`, `zone: minage`, `zone: bourse`, `zone: traduction`… | La partie du jeu concernée |
| `statut:` | `statut: à trier`, `statut: besoin d'infos`, `statut: confirmé`, `statut: en cours`, `statut: bloqué` | Où en est le sujet |

Pour une première contribution, cherche les issues [`good first issue`](https://github.com/Itaromi/CryptoMeme/labels/good%20first%20issue). Avant de te lancer sur une issue `statut: confirmé`, laisse un commentaire pour qu'on la passe en `statut: en cours`.

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
