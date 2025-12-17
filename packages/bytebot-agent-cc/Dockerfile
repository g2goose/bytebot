# ============================================
# Stage 1: Builder Stage
# ============================================
FROM node:20-bullseye AS builder

WORKDIR /build

# Copy and build shared module
COPY ./shared ./shared
WORKDIR /build/shared
RUN npm ci && npm run build

# Copy and build bytebot-agent-cc
WORKDIR /build
COPY ./bytebot-agent-cc ./bytebot-agent-cc
WORKDIR /build/bytebot-agent-cc
RUN npm ci --only=production && npm run build

# ============================================
# Stage 2: Runtime Stage (Distroless)
# ============================================
FROM gcr.io/distroless/nodejs20-debian12:nonroot

# Set working directory
WORKDIR /app

# Copy shared module (built artifacts and dependencies)
COPY --from=builder --chown=nonroot:nonroot /build/shared/dist ./shared/dist
COPY --from=builder --chown=nonroot:nonroot /build/shared/package.json ./shared/package.json
COPY --from=builder --chown=nonroot:nonroot /build/shared/node_modules ./shared/node_modules

# Copy bytebot-agent-cc (built artifacts and dependencies)
COPY --from=builder --chown=nonroot:nonroot /build/bytebot-agent-cc/dist ./dist
COPY --from=builder --chown=nonroot:nonroot /build/bytebot-agent-cc/node_modules ./node_modules
COPY --from=builder --chown=nonroot:nonroot /build/bytebot-agent-cc/package.json ./package.json

# Distroless runs as nonroot (UID 65532) by default
USER nonroot

# Expose port
EXPOSE 9991

# Run the application (node is the default entrypoint in nodejs distroless)
CMD ["/app/dist/main.js"]
