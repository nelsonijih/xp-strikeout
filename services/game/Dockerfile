# Build context = repo root (see infra/docker-compose.yml). Runs via tsx (no build step for MVP).
FROM node:20-slim
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages ./packages
COPY services/game ./services/game

RUN pnpm install

WORKDIR /app/services/game
EXPOSE 2567
CMD ["pnpm", "start"]
