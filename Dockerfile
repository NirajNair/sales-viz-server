# Stage 1: Install dependencies
FROM oven/bun:1 AS deps

WORKDIR /app

COPY package.json bun.lock ./

RUN bun install --frozen-lockfile

# Stage 2: Production image
FROM oven/bun:1-slim

WORKDIR /app

ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY .env ./
COPY drizzle.config.ts ./
COPY drizzle ./drizzle
COPY docker-entrypoint.sh ./

RUN chmod +x docker-entrypoint.sh

EXPOSE 8000

# ENTRYPOINT ["./docker-entrypoint.sh"]

CMD ["./docker-entrypoint.sh", "bun", "src/index.ts"]
