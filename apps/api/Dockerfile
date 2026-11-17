# syntax=docker/dockerfile:1.7
# Image de l'API CryptoMeme (NestJS + Prisma). Contexte de build : racine du dépôt.
#   docker build -f apps/api/Dockerfile -t cryptomeme-api .

FROM node:26-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
# corepack n'est plus fourni à partir de Node 25 : pnpm est installé via npm
RUN npm install -g pnpm@10.19.0 && npm cache clean --force
WORKDIR /app

# ── Dépendances (couche mise en cache tant que les manifestes ne changent pas)
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/engine/package.json packages/engine/
COPY packages/shared/package.json packages/shared/
COPY apps/api/prisma apps/api/prisma
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
  pnpm install --frozen-lockfile --filter @cryptomeme/api...

# ── Build
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages packages
COPY apps/api apps/api
RUN pnpm --filter @cryptomeme/engine build \
  && pnpm --filter @cryptomeme/shared build \
  && pnpm --filter @cryptomeme/api build

# ── Dépendances de production uniquement (prisma CLI et tsx inclus : migrations et seed)
FROM base AS prod-deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/engine/package.json packages/engine/
COPY packages/shared/package.json packages/shared/
COPY apps/api/prisma apps/api/prisma
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store   pnpm install --frozen-lockfile --prod --filter @cryptomeme/api...

# ── Exécution (utilisateur non-root)
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=prod-deps --chown=node:node /app /app
COPY --from=build --chown=node:node /app/packages/engine/dist /app/packages/engine/dist
COPY --from=build --chown=node:node /app/packages/shared/dist /app/packages/shared/dist
COPY --from=build --chown=node:node /app/apps/api/dist /app/apps/api/dist
# Sources des catalogues : utilisées par le seed (tsx)
COPY --from=build --chown=node:node /app/apps/api/src /app/apps/api/src
USER node
WORKDIR /app/apps/api
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3   CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Les migrations s'appliquent au démarrage (idempotent), puis l'API démarre
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && exec node dist/main.js"]
