# Déployer CryptoMeme

Ce guide décrit le déploiement de référence : **un NAS (ou tout serveur Linux avec Docker)**, exposé sur Internet par un **tunnel Cloudflare**, avec les e-mails transactionnels envoyés par **Resend**.

```
Joueur ──HTTPS──▶ Cloudflare ──tunnel──▶ cloudflared ──HTTP──▶ Caddy :8088 ─┬─ /api, /socket.io ─▶ api:4000 ─▶ postgres
                                                                              └─ le reste ─────────▶ web:3000
```

Rien n'est ouvert sur la box : le tunnel sort du NAS vers Cloudflare. Seul Caddy écoute (port 8088), la base n'est jamais exposée.

---

## 1. E-mails : Resend

1. Crée un compte sur [resend.com](https://resend.com).
2. **Domains → Add domain** : ajoute ton domaine (ex. `exemple.fr`, ou un sous-domaine dédié comme `mail.exemple.fr`). Si le DNS est chez Cloudflare, le bouton « Auto configure » crée les enregistrements SPF/DKIM ; sinon copie-les à la main. Attends le statut **Verified**.
3. **API Keys → Create** : permission **Sending access**, limitée à ce domaine. Garde la clé (`re_…`).
4. Dans `.env` (étape 2) :
   ```env
   RESEND_API_KEY=re_xxxxxxxx
   MAIL_FROM="CryptoMeme <no-reply@exemple.fr>"
   ```

Les e-mails envoyés : confirmation d'adresse, mot de passe oublié, alerte « mot de passe modifié ».

## 2. Le serveur

```bash
ssh <utilisateur>@<ip-du-nas>
git clone https://github.com/<compte>/CryptoMeme.git ~/cryptomeme
cd ~/cryptomeme/deploy
cp .env.example .env
```

Remplis `.env` :

```bash
# génère les secrets
openssl rand -base64 48   # → JWT_SECRET
openssl rand -hex 24      # → POSTGRES_PASSWORD
```

```env
WEB_URL=https://cryptomeme.exemple.fr
POSTGRES_PASSWORD=…
JWT_SECRET=…
RESEND_API_KEY=re_…
MAIL_FROM="CryptoMeme <no-reply@exemple.fr>"
TRUST_CLOUDFLARE=true
HTTP_PORT=8088
SEED_ADMIN_EMAIL=toi@exemple.fr
SEED_ADMIN_PASSWORD=…   # 14 caractères minimum
```

Protège le fichier : `chmod 600 .env`.

Lance la pile — au choix :

```bash
# a) construire les images sur le serveur (aucun compte nécessaire)
docker compose -f docker-compose.prod.yml up -d --build

# b) ou utiliser les images publiées par la CI sur GHCR
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

Les migrations de base s'appliquent automatiquement au démarrage de l'API. Ensuite, **une seule fois**, charge le contenu du jeu (cryptos, sociétés, catalogue de minage, banques, événements, succès, compte admin) :

```bash
docker compose -f docker-compose.prod.yml exec api node_modules/.bin/tsx prisma/seed.ts
```

Vérifie : `curl http://localhost:8088/api/health` → `{"ok":true}`.

## 3. Le tunnel Cloudflare

Dans **Cloudflare Zero Trust → Networks → Tunnels**, ouvre le tunnel du NAS puis **Public Hostname → Add** :

| Champ | Valeur |
|---|---|
| Subdomain | `cryptomeme` |
| Domain | `exemple.fr` |
| Type | `HTTP` |
| URL | `<ip-du-nas>:8088` (IP locale du NAS + `HTTP_PORT`) |

Les WebSockets passent nativement par le tunnel.

**Tunnel géré par fichier (`config.yml`)** : ajoute la règle avant la règle finale `http_status:404`, puis redémarre cloudflared :

```yaml
ingress:
  - hostname: cryptomeme.exemple.fr
    service: http://<ip-du-nas>:8088
  # … tes autres services
  - service: http_status:404
```

**Option « zéro exposition sur le réseau local »** : si cloudflared tourne en conteneur Docker sur la même machine, branche-le sur le réseau de la pile et fais pointer le tunnel vers `http://proxy:80`, puis mets `HTTP_BIND=127.0.0.1` dans `.env` :

```bash
docker network connect cryptomeme_internal <nom-du-conteneur-cloudflared>
```

### Réglages Cloudflare conseillés

- SSL/TLS : mode **Full**, **Always Use HTTPS** activé.
- Security : **Bot Fight Mode** activé.
- (Optionnel) une règle de limitation de débit sur `/api/auth/*`.

## 4. Mettre à jour

```bash
cd ~/cryptomeme && git pull
cd deploy
docker compose -f docker-compose.prod.yml up -d --build      # ou : pull && up -d
docker image prune -f
```

Les migrations s'appliquent toutes seules. Relancer le seed après une mise à jour est sans danger : il ajoute le nouveau contenu et met à jour l'existant.

## 5. Sauvegardes

Le service `backup` fait un dump quotidien de la base dans `deploy/backups/` (7 jours, 4 semaines, 6 mois). Pense à inclure ce dossier dans les sauvegardes du NAS.

Restaurer un dump :

```bash
gunzip -c backups/last/cryptomeme-latest.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T db psql -U cryptomeme -d cryptomeme
```

## 6. Dépannage

| Symptôme | Piste |
|---|---|
| L'API redémarre en boucle | `docker compose -f docker-compose.prod.yml logs api` : la configuration est validée au démarrage et le message dit quoi corriger. |
| Pas d'e-mail reçu | Logs de l'API (`[Mail]`) ; domaine bien **Verified** chez Resend ; `MAIL_FROM` sur ce domaine. |
| Tout le monde est limité en même temps | `TRUST_CLOUDFLARE=true` manquant : l'API voit l'IP du tunnel au lieu de celle des joueurs. |
| Prix figés, pas de temps réel | Vérifie que `/socket.io/` arrive bien à Caddy (WebSockets autorisés dans Cloudflare). |
