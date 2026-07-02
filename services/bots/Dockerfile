# Build context = repo root (see infra/docker-compose.yml).
FROM node:20-slim
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages ./packages
COPY services/bots ./services/bots

RUN pnpm install

WORKDIR /app/services/bots
CMD ["pnpm", "start"]
