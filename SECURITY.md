# Sécurité

CryptoMeme est un jeu : l'argent y est **100 % fictif**. Une faille reste une faille (vol de compte, triche qui casse le classement, fuite de données des joueurs), merci de nous aider à les corriger.

## Signaler une vulnérabilité

**N'ouvre pas d'issue publique.** Utilise le signalement privé de GitHub :
[Security → Report a vulnerability](https://github.com/Itaromi/CryptoMeme/security/advisories/new).

Indique si possible :
- ce qui est touché (API, site, déploiement) et la version / le commit ;
- les étapes pour reproduire ;
- l'impact (prise de compte, triche, fuite de données…).

Tu recevras une réponse sous quelques jours. Merci de laisser le temps de corriger avant toute divulgation.

## Périmètre

Dans le périmètre :
- authentification, sessions, réinitialisation de mot de passe ;
- toute manière de **créer de l'argent ou des actifs** hors des règles du jeu (le grand livre doit toujours tomber juste) ;
- accès aux données d'un autre joueur, élévation de privilèges (admin) ;
- injection, XSS, CSRF, contournement des limites de débit.

Hors périmètre : déni de service volumétrique, ingénierie sociale, vulnérabilités sans impact démontrable.

## Mesures en place

- Mots de passe hachés en argon2id ; jetons de session et de réinitialisation hachés (SHA-256), à usage unique, avec rotation et révocation par famille des refresh tokens.
- Cookies `httpOnly`, `SameSite=Lax`, `Secure` en production ; contrôle d'origine et de `Content-Type` sur les requêtes qui modifient l'état.
- Limitation de débit par IP réelle (en-tête Cloudflare), plus stricte sur l'authentification.
- En-têtes de sécurité (CSP, HSTS, `X-Frame-Options`, etc.).
- Validation de toutes les entrées (Zod) ; toute variation de cash ou d'actif passe par une écriture au grand livre, en transaction avec verrous de ligne.
- Configuration validée au démarrage : l'API refuse de démarrer avec un secret faible en production.
- Conteneurs non-root, système de fichiers en lecture seule, base de données non exposée.
