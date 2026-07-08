# syntax=docker/dockerfile:1

# ---- Build stage ----
FROM oven/bun:1 AS build
WORKDIR /app

# Nitro standalone Node server (overrides the cloudflare default preset)
ENV NITRO_PRESET=node-server

# Sem VITE_* inlined: o better-auth é same-origin e o resto é server-only
# (DATABASE_URL, BETTER_AUTH_*, ASAAS_*, LOVABLE_API_KEY, APIFY_TOKEN) entra
# como env de RUNTIME no Coolify — nada de segredo no bundle do cliente.

# Install deps (cached layer)
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

# Build
COPY . .
RUN bun run build

# ---- Runtime stage ----
FROM oven/bun:1-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000

# Nitro node-server output is fully self-contained in .output
COPY --from=build /app/.output ./.output

EXPOSE 3000
CMD ["bun", ".output/server/index.mjs"]
