# CryptoMeme — Spécification de conception (v0.1)

> Jeu web de trading **100 % fictif** : cryptos mèmes, actions d'entreprises bidons, fermes de minage, banques, événements aléatoires. Objectif : finir **#1 du classement en patrimoine net**.
> Aucune vraie monnaie, aucun vrai actif. L'argent du jeu n'est ni achetable ni convertible.

---

## 1. Stack technique

| Couche | Choix | Pourquoi |
|---|---|---|
| Monorepo | **pnpm workspaces + Turborepo** | Types partagés front/back, un seul `pnpm dev` |
| Back | **NestJS** (TypeScript) | Demandé. Modules propres, guards, cron, WebSockets |
| ORM / DB | **Prisma + PostgreSQL 16** | Transactions ACID, `SELECT … FOR UPDATE`, types générés |
| Cache / files | **Redis + BullMQ** | Tick du marché, jobs de minage, événements planifiés, pub/sub des prix |
| Temps réel | **Socket.IO** (gateway Nest) | Prix live, carnet de trades, notifications d'événements |
| Front | **Next.js 15 (App Router) + React + Tailwind + shadcn/ui** | SSR pour profils/classement publics, dashboards riches |
| Data front | **TanStack Query** + client WS | Cache + invalidation sur les events temps réel |
| Graphiques | **lightweight-charts** (bougies) + **Recharts** (stats) | Bougies type TradingView, légères |
| Validation | **Zod** dans `packages/shared` | Mêmes schémas côté API et formulaires |
| Auth | Email + mot de passe (**argon2id**), JWT access court + refresh token en cookie httpOnly, vérif email, reset mdp | |
| Dev | **Docker Compose** (Postgres, Redis, Mailpit) | Environnement local en une commande |
| Tests | Vitest/Jest + tests de simulation du moteur économique | L'économie doit être testée hors-ligne |

```
cryptomeme/
├─ apps/
│  ├─ api/        NestJS (REST + WS + workers BullMQ)
│  └─ web/        Next.js (jeu + /admin)
├─ packages/
│  ├─ shared/     types, schémas Zod, constantes de jeu
│  └─ engine/     moteur économique PUR (sans I/O) : AMM, prix, minage, taxes → testable & simulable
├─ docker-compose.yml
└─ docs/
```

Le **moteur économique est isolé dans `packages/engine`** (fonctions pures). On peut donc lancer des simulations de 10 000 joueurs-bots sur 90 jours en local pour équilibrer avant de mettre en prod.

---

## 2. Principes d'intégrité (« on ne peut pas se give »)

1. **Grand livre en partie double** : chaque mouvement (achat, vente, frais, taxe, récompense de minage, achat boutique, action admin) = une écriture `LedgerEntry` débit/crédit. Le solde est dérivé ou vérifiable. Rien ne bouge sans écriture.
2. **Toutes les opérations côté serveur**, dans une transaction Postgres avec verrou de ligne sur le wallet. Le client n'envoie que des intentions (« acheter 100 $DOGEZ, slippage max 2 % »).
3. **Montants en entiers** : cash en centimes (`BigInt`), quantités d'actifs en `Decimal(38,18)`. Jamais de `float` pour l'argent.
4. **Idempotence** : chaque ordre porte une `clientOrderId` → pas de double exécution.
5. **Pas de transfert libre entre joueurs** au lancement (anti multi-comptes qui alimentent un main). Voir question ouverte.
6. **Rate limiting** par utilisateur et par IP, cooldown entre ordres sur un même actif.
7. **Valorisation anti-manipulation** pour le classement : un actif illiquide est valorisé à ce qu'on obtiendrait réellement en le vendant (prix après slippage), pas au dernier prix. Impossible de gonfler son patrimoine en pompant une coin sans liquidité.
8. **Journal d'audit admin** : toute action admin (crédit, ban, déclenchement d'événement) est tracée, avec motif obligatoire.

---

## 3. Marché crypto — algorithme de prix

### 3.1 Modèle : AMM + flux de « traders fantômes »

Chaque crypto a un **pool de liquidité à produit constant** (`x · y = k`, comme un DEX) entre la coin et le cash du jeu.

- **Les joueurs achètent/vendent contre le pool** → leur impact sur le prix est naturel et réaliste : gros ordre = gros slippage. Acheter fait monter, vendre fait baisser. ✅ Exactement « la variation est influée par l'achat et la revente des gens ».
- **Frais de swap** (ex. 0,3 %, modulé par la banque) → coût du trading, empêche le spam aller-retour.

Pour que le marché vive même sans joueurs, un **moteur de flux** injecte à chaque tick (toutes les 5 s) des ordres de **traders fantômes** (PNJ) dont le volume net suit :

```
log-prix cible :  dS = θ(μ(t) − S)dt + σ(t)·dW + J·dN
```

- **θ, μ** : retour à la moyenne vers une « valeur fondamentale » qui dérive lentement (tendance/narratif de la coin).
- **σ(t)** : volatilité à **régimes** (calme / agité / euphorie / panique), chaîne de Markov — les mèmes passent de l'ennui à la folie.
- **J·dN** : **sauts** de Poisson (pumps, dumps, rug pulls) — les « pertes brutales ».
- **Momentum / FOMO** : si les joueurs achètent massivement, les PNJ suivent un temps (effet troupeau), puis prennent leurs bénéfices.

Les PNJ tradent contre le même pool que les joueurs : **un seul prix, une seule vérité**.

### 3.2 Profils de coins
| Tier | Liquidité | Volatilité | Risque rug | Exemple de nom |
|---|---|---|---|---|
| Blue chip mème | énorme | faible | ~0 | **Bitconnard (BTCN)** |
| Mid cap | moyenne | moyenne | faible | **Ethernul (ETN)**, **DogeCoinCoin (DCC)** |
| Shitcoin | faible | délirante | élevé | **SafeMoonMoon**, **ElonsTweet (TWEET)**, **RugPullInu** |
| Coin de minage | variable | moyenne | — | coins minables par algo (voir §5) |

### 3.3 Données
- Bougies OHLCV agrégées 1m / 5m / 1h / 1j (job d'agrégation), historique de trades.
- Diffusion WS des prix à chaque tick, par « room » d'actif.

---

## 4. Marché actions

Même moteur AMM (cohérence), avec des différences :
- **Horaires d'ouverture** (ex. 9h–22h heure du jeu) → gaps à l'ouverture.
- **Valeur fondamentale pilotée par des « résultats trimestriels »** fictifs (beat/miss) et des news d'entreprise.
- **Dividendes** versés aux détenteurs, **splits**, **OPA**, **faillite** (action → 0).
- Entreprises parodiques : **Pomme Inc.**, **Microsoftée**, **Tesla Mais Pas Trop**, **McDouble Holdings**, **Leroy Merdelin**…
- Plus tard : **vente à découvert** et **levier**, réservés à certaines banques (avec liquidation forcée).

---

## 5. Minage

### 5.1 Composants (catalogue ~100+ par catégorie, géré en admin)
| Catégorie | Stats clés |
|---|---|
| **CPU** | hashrate par algo, conso (W), chaleur, prix, durabilité |
| **GPU** | hashrate par algo (fort), conso, chaleur, VRAM (certains algos exigent un min), taux de panne |
| **ASIC** | énorme hashrate sur **un seul** algo, inutile ailleurs, bruyant/chaud |
| **Alimentation (PSU)** | puissance max, rendement (80+ Bronze → Titanium) |
| **Carte mère** | nb de slots GPU, compatibilité CPU |
| **Refroidissement** | capacité de dissipation (air / watercooling / immersion) |
| **Rack** | nb d'emplacements, bonus de flux d'air |
| **Local** | garage / entrepôt / data-center / bunker islandais → coût électricité, capacité |

Les composants sont des objets uniques avec **usure** (`wear` 0→100 %) et une **valeur de revente** dégressive (comptée dans le patrimoine).

### 5.2 Calcul d'une rig
```
hashrate_algo = Σ composants.hashrate[algo] × efficacité_thermique × (1 − pénalité_usure)
conso_mur      = Σ conso / rendement_PSU          (refus si > puissance PSU)
température    = f(chaleur totale − capacité refroidissement, climat du local)
P(panne/heure) = base × e^(k·(temp − seuil)) × (1 + usure)
```
Overclock possible : +hashrate, +chaleur, +risque. Une panne peut **griller un GPU** (perte sèche) voire **déclencher un incendie** (rack entier, sauf assurance bancaire).

### 5.3 Algos, réseau, difficulté
- Chaque coin minable a un **algo** (`SHA-Meme`, `Scrypt-LOL`, `KekHash`, `ProofOfVibe`…).
- **Difficulté globale** ajustée selon le hashrate total de tous les joueurs → plus il y a de mineurs sur une coin, moins chacun gagne. La stratégie = trouver la coin sous-minée.
- Les coins minées arrivent dans le wallet → les vendre **pousse le prix vers le bas** (boucle économique réelle).

### 5.4 Pools de minage
| Pool | Paiement | Variance | Frais | Risque |
|---|---|---|---|---|
| PPS | fixe par part | nulle | élevés | faible |
| PPLNS | selon les blocs trouvés | moyenne | moyens | faible |
| SOLO | tout ou rien | extrême | 0 | — |
| Pool louche | gros bonus | moyenne | 0 % | **exit scam** possible |

**Combos** : répartir son hashrate entre plusieurs pools ; certaines alliances donnent des bonus (ex. 3 pools d'une même « fédération » → −1 % de frais), d'autres se pénalisent. Les joueurs peuvent aussi **créer leur propre pool** (boutique) et toucher les frais des autres.

### 5.5 Tick de minage
Job toutes les minutes : calcul des parts, tirage de la chance du pool, paiement, usure, pannes, facture d'électricité (débitée en cash — si plus de cash, les rigs s'arrêtent).

---

## 6. Banques

Chaque joueur ouvre un compte à l'inscription dans **la banque gratuite**. Changer de banque coûte des frais et a un délai.

| Banque | Abonnement | Avantages | Risques |
|---|---|---|---|
| **Néo-Banque Gratos** | 0 | — | plafonds bas |
| **Crédit Mutuel Agricole Bancaire** | faible | intérêts sur cash, frais réduits | — |
| **BNP Parodibas** | moyen | levier ×2, assurance matériel | — |
| **Banque Suisse Discrète** | élevé | réduction des taxes (optimisation fiscale), plafonds élevés | cible des enquêtes fiscales |
| **CryptoBank des Îles Caïmans** | élevé | 0 frais crypto, levier ×5 | peut **faire faillite** (bank run) — garantie des dépôts plafonnée |

Effets possibles : taux d'intérêt, réduction de frais de trading, cashback électricité, plafonds de retrait/ordre, levier, assurances (panne, hack, taxe), accès anticipé aux IPO.

---

## 7. Événements aléatoires

Moteur d'événements planifié (BullMQ) : chaque type a une **probabilité**, un **cooldown**, une **portée** (global / un actif / un secteur / les X plus riches / un joueur aléatoire) et des **effets**. Tout est paramétrable et déclenchable à la main en admin.

| Négatifs | Positifs | Marché |
|---|---|---|
| **Flat tax** : 30 % sur les plus-values réalisées des 24 dernières h | **Airdrop** surprise d'une coin | **Bull run** global |
| **Impôt sur les riches** : progressif au-delà d'un seuil de patrimoine | **Héritage** d'un oncle d'Amérique | **Krach** |
| **Hack de banque** / de wallet | **Dividende exceptionnel** | **Rug pull** d'un shitcoin |
| **Canicule** → pannes de rigs ×3 | **Pénurie de GPU** → valeur du matériel ↑ | **Elon a tweeté** → pump d'une coin |
| **Crise énergétique** → électricité ×2 | **Subvention minage vert** | **Halving** d'une coin minable |
| **Contrôle fiscal** (cible les banques offshore) | **Remboursement d'impôt** | **IPO** d'une nouvelle entreprise |

Les événements sont annoncés en live (bannière + notif), certains avec **préavis** (ex. « Flat tax dans 2 h ») pour créer de la stratégie.

---

## 8. Classement, profils, statistiques

- **Patrimoine net** = cash + crypto & actions (valeur liquidative) + matériel de minage (valeur de revente) − dettes (levier).
- Snapshot horaire du patrimoine → courbe d'évolution.
- Classements : général, journalier, hebdo, par catégorie (meilleur trader crypto, meilleur mineur, plus gros hashrate, plus gros gain en un trade, plus grosse perte 💀).
- **Stats avancées** : PnL réalisé/latent, win rate, meilleur/pire trade, volume, frais payés, taxes payées, **ratio de Sharpe**, **drawdown max**, exposition par actif, hashrate & rendement par € d'électricité, heatmap d'activité.
- Profil public : avatar, cadre, bannière, titre, badges, vitrine de succès.

---

## 9. Boutique, succès, création d'actifs

- **Cosmétiques** : cadres, bannières, titres, badges animés, effets de pseudo.
- **Succès** : « Diamond Hands » (garder une coin −90 % sans vendre), « Rug Survivor », « Pyromane » (rig brûlée), « Premier million »… certains débloquent des cosmétiques exclusifs.
- **Création d'une crypto** : coût élevé + liquidité initiale à fournir au pool. Garde-fous : **liquidité verrouillée** X jours, part du créateur en **vesting**, nom modéré par l'admin.
- **Création d'une entreprise (IPO)** : le joueur fonde une boîte, met des actions en bourse, peut verser des dividendes ; sa valeur fondamentale dépend de règles du jeu.
- **Création d'un pool de minage**.

---

## 10. Admin

Panel `/admin` (rôles `ADMIN`, `MODERATOR`) :
- Utilisateurs : recherche, ban/suspension, reset, historique complet du grand livre, détection d'anomalies (gains anormaux, IPs partagées).
- Actifs : créer/éditer cryptos & actions, paramètres du moteur (σ, θ, régimes, liquidité), geler un marché.
- Minage : catalogue de composants (import CSV), algos, pools.
- Banques, boutique, succès : CRUD complet.
- Événements : probabilités, déclenchement manuel, historique.
- Économie : masse monétaire totale, sources/puits d'argent, inflation — tableaux de bord pour équilibrer.
- Saisons : démarrage/clôture, archivage du classement.
- Journal d'audit.

---

## 11. Feuille de route

| Phase | Contenu | Résultat |
|---|---|---|
| **0. Fondations** | Monorepo, Docker, Prisma, auth complète, grand livre, wallet, banque gratuite | On peut s'inscrire et avoir un solde |
| **1. Marché crypto (MVP jouable)** | Moteur AMM + PNJ, tick, WS, page de trading avec bougies, portefeuille, classement, profil simple, admin de base | **Jeu jouable** |
| **2. Minage** | Catalogue composants, rigs, locaux, pools, difficulté, pannes | |
| **3. Actions** | Entreprises, horaires, résultats, dividendes | |
| **4. Banques & événements** | Banques premium, moteur d'événements, taxes | |
| **5. Méta** | Stats avancées, succès, boutique, cosmétiques | |
| **6. Création d'actifs** | Créer sa crypto / son entreprise / son pool | |
| **7. Équilibrage & prod** | Simulations, anti-triche, déploiement | |

---

## 12. Décisions prises (16/11/2026)
- **Saisons avec reset** (~1 mois) : chaque saison, chaque joueur reçoit un nouveau wallet avec le même capital de départ. Classement archivé ; profil, cosmétiques et succès conservés.
- **Boutique payée uniquement en cash du jeu** : chaque achat (cosmétique ou création d'actif) réduit le patrimoine → vrai arbitrage frime vs classement. Les cosmétiques achetés restent acquis après le reset.
- **Pas de transferts entre joueurs.**
- **Première itération = phases 0 + 1.** Pour le MVP, le tick tourne via `@nestjs/schedule` dans l'API (une seule instance) ; Redis/BullMQ arrive avec le minage et les événements.
