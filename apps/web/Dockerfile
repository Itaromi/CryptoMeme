# syntax=docker/dockerfile:1.7
# Image du site CryptoMeme (Next.js, sortie « standalone »). Contexte de build : racine du dépôt.
#   docker build -f apps/web/Dockerfile -t cryptomeme-web .

FROM node:26-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@10.19.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/engine/package.json packages/engine/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
  pnpm install --frozen-lockfile --filter @cryptomeme/web...

FROM deps AS build
ENV NEXT_TELEMETRY_DISABLED=1
# En prod le reverse proxy route /api vers l'API ; ce repli ne sert que si le site est joint directement
ARG API_URL=http://api:4000
ENV API_URL=$API_URL
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @cryptomeme/shared build && pnpm --filter @cryptomeme/web build

# ── Exécution : seulement le serveur autonome et les fichiers statiques
FROM node:26-bookworm-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
