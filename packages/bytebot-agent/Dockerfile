# ============================================
# Stage 1: Builder Stage
# ============================================
FROM node:20-bullseye AS builder

WORKDIR /build

# Copy and build shared module
COPY ./shared ./shared
WORKDIR /build/shared
RUN npm ci && npm run build

# Copy and build bt1zar module
WORKDIR /build
COPY ./bt1zar ./bt1zar
WORKDIR /build/bt1zar
RUN npm ci && npm run build

# Copy and build bytebot-agent
WORKDIR /build
COPY ./bytebot-agent ./bytebot-agent
WORKDIR /build/bytebot-agent
RUN npm ci --only=production

# Generate Prisma Client at build time
RUN npx prisma generate

# Build NestJS application
RUN npm run build

# ============================================
# Stage 2: Migration Runner (for init container)
# ============================================
FROM node:20-bullseye-slim AS migration-runner

WORKDIR /app

# Copy Prisma files needed for migrations
COPY --from=builder /build/bytebot-agent/prisma ./prisma
COPY --from=builder /build/bytebot-agent/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /build/bytebot-agent/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /build/bytebot-agent/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY --from=builder /build/bytebot-agent/package.json ./package.json

# Create migration script
RUN echo '#!/bin/sh\n\
set -e\n\
echo "Running Prisma database migrations..."\n\
npx prisma migrate deploy\n\
echo "Migrations completed successfully"\n\
' > /migrate.sh && chmod +x /migrate.sh

# This stage is used as an init container in Docker Compose/Kubernetes

# ============================================
# Stage 3: Runtime Stage (Distroless)
# ============================================
FROM gcr.io/distroless/nodejs20-debian12:nonroot AS runtime

WORKDIR /app

# Copy shared module
COPY --from=builder --chown=nonroot:nonroot /build/shared/dist ./shared/dist
COPY --from=builder --chown=nonroot:nonroot /build/shared/package.json ./shared/package.json
COPY --from=builder --chown=nonroot:nonroot /build/shared/node_modules ./shared/node_modules

# Copy bt1zar module
COPY --from=builder --chown=nonroot:nonroot /build/bt1zar/dist ./bt1zar/dist
COPY --from=builder --chown=nonroot:nonroot /build/bt1zar/package.json ./bt1zar/package.json
COPY --from=builder --chown=nonroot:nonroot /build/bt1zar/node_modules ./bt1zar/node_modules

# Copy bytebot-agent application
COPY --from=builder --chown=nonroot:nonroot /build/bytebot-agent/dist ./dist
COPY --from=builder --chown=nonroot:nonroot /build/bytebot-agent/node_modules ./node_modules
COPY --from=builder --chown=nonroot:nonroot /build/bytebot-agent/package.json ./package.json

# Copy Prisma generated client (already generated at build time)
COPY --from=builder --chown=nonroot:nonroot /build/bytebot-agent/node_modules/.prisma ./node_modules/.prisma

# Distroless runs as nonroot (UID 65532) by default
USER nonroot

# Expose port
EXPOSE 9991

# Run the application (node is the default entrypoint in nodejs distroless)
CMD ["/app/dist/main.js"]
