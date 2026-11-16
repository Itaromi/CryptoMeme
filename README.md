# CryptoMeme

Jeu de trading de cryptos **100 % fictives** : AMM, traders PNJ, rug pulls, classement par saison.
Conception complète : [docs/SPEC.md](docs/SPEC.md).

## Démarrer en local

Prérequis : Node 22+, pnpm 10, Docker Desktop lancé.

```bash
pnpm install
pnpm db:up                                   # Postgres (5434) + Mailpit (http://localhost:8025)
cp apps/api/.env.example apps/api/.env       # puis mets un JWT_SECRET de 32+ caractères
pnpm --filter @cryptomeme/api exec prisma migrate dev
pnpm db:seed                                 # banques, saison 1, 12 cryptos, compte admin
pnpm dev                                     # API :4000 + web :3000
```

- Jeu : http://localhost:3000
- Emails (vérification, reset) : http://localhost:8025
- Admin de dev : `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` dans `apps/api/.env`

## Structure

| Dossier | Rôle |
|---|---|
| `packages/engine` | Moteur économique pur (AMM x·y=k, processus de prix PNJ, régimes, sauts, rug pulls). `pnpm --filter @cryptomeme/engine test` / `simulate 30 7` |
| `packages/shared` | Schémas Zod et constantes partagés front/back |
| `apps/api` | NestJS + Prisma : auth (cookies httpOnly, refresh rotatif), grand livre, trading, tick du marché, minage, WebSocket, classement, admin |
| `apps/web` | Next.js : marché, graphiques en bougies, ordres avec aperçu du slippage, portefeuille, ferme de minage, profils, classement, admin |
| `apps/api/prisma/catalog.ts` | Générateur déterministe du catalogue de minage (~400 modèles : GPU, CPU, ASIC, alims, cartes mères, refroidissement, racks), des locaux, réseaux et pools |

## Minage (phase 2)

- **Rig** = carte mère + CPU + GPU(s) + alimentation + refroidissement, ou ASIC + alimentation, montée dans un **rack**, installé dans un **local** (prix du kWh, puissance max, température ambiante).
- 4 réseaux minables (BTCN/SHA-Meme, DCC/Scrypt-LOL, MAMIE/KekHash, KEBAB/ProofOfVibe). Émission fixe par minute partagée entre joueurs et mineurs PNJ, qui suivent le prix. Halving tous les 14 jours.
- Pools PPS / PPLNS / Solo / louches (bonus + risque d'exit scam), remise de fédération si 3 pools d'une même fédération.
- Tick chaque minute : gains, facture d'électricité (coupure si plus de cash), usure, pannes, incendies au-delà de 95 °C, disjoncteur si le local est en surcharge.
- Le matériel compte dans le patrimoine à sa valeur de revente (60 % × (1 − usure)), les locaux à 50 %.
- Ticks protégés par un bail en base (`JobLease`) : une seule instance de l'API les exécute.

## Banques & événements (phase 4)

- **5 banques** (`prisma/economy-catalog.ts`) : abonnement et intérêts au prorata toutes les 5 min, remise électricité, assurance matériel (pannes/incendies), bouclier fiscal, protection piratage, risque de faillite avec garantie des dépôts. Patrimoine minimum et frais d'ouverture ; un changement par 24 h. Compte clôturé (retour à la banque gratuite) si l'abonnement n'est plus payable.
- **19 types d'événements** : flat tax, impôt sur les riches, contrôle fiscal, remboursement, piratage bancaire, vol de wallet, faillite, airdrop, héritage, dividende exceptionnel, bull run, krach, tweet d'Elon, rug pull, canicule, crise énergétique, pénurie de GPU, subvention verte, tempête solaire.
- Déclenchement aléatoire (fréquence, cooldown), **préavis** annoncé dans un bandeau « flash info », effets instantanés ou à durée (modificateurs appliqués au minage et à la boutique). Tout est réglable et déclenchable depuis l'admin, avec motif obligatoire.
- Notifications par joueur (cloche dans l'en-tête), page « Actu » avec historique et impact de chaque événement.

## Règles d'intégrité

- Toute variation de cash ou d'actif passe par une écriture `LedgerEntry` (vérifiable : somme du grand livre = solde).
- Ordres exécutés en transaction avec verrous de ligne, idempotents via `clientOrderId`, cooldown 1 s, rate limit.
- Classement = cash + **valeur de revente réelle** (slippage inclus) : impossible de gonfler son patrimoine sur une coin illiquide.
- Staff (admin/modo) exclu du classement. Toute action admin exige un motif et est journalisée.
