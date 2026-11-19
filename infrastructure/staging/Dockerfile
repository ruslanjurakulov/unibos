FROM node:24.22.1-bookworm-slim AS build
WORKDIR /srv/unibos
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/website/package.json ./apps/website/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/security/package.json ./packages/security/package.json
COPY packages/runtime/package.json ./packages/runtime/package.json
RUN npm ci --no-audit --no-fund
COPY apps/ ./apps/
COPY packages/ ./packages/
RUN npm run build

FROM node:24.22.1-bookworm-slim
WORKDIR /srv/unibos
ENV NEXT_TELEMETRY_DISABLED=1
COPY --chown=node:node --from=build /srv/unibos/node_modules ./node_modules
COPY --chown=node:node --from=build /srv/unibos/packages ./packages
COPY --chown=node:node --from=build /srv/unibos/apps/api/dist ./apps/api/dist
COPY --chown=node:node --from=build /srv/unibos/apps/website/.next ./apps/website/.next
COPY --chown=node:node --from=build /srv/unibos/apps/website/public ./apps/website/public
COPY --chown=node:node --from=build /srv/unibos/apps/website/next.config.ts /srv/unibos/apps/website/staging-preview.ts /srv/unibos/apps/website/package.json ./apps/website/
COPY --chown=node:node infrastructure/migrate.mjs ./infrastructure/migrate.mjs
RUN mkdir -p apps/website/.next/cache && chown node:node apps/website/.next/cache
USER node
CMD ["node", "apps/api/dist/main.js"]
