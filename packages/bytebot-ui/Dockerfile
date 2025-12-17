# ============================================
# Stage 1: Dependencies Stage
# ============================================
FROM node:20-bullseye AS deps

# Declare build arguments
ARG BYTEBOT_AGENT_BASE_URL
ARG BYTEBOT_DESKTOP_VNC_URL

WORKDIR /build

# Copy and build shared module
COPY ./shared ./shared
WORKDIR /build/shared
RUN npm ci && npm run build

# Copy bytebot-ui package files
WORKDIR /build/bytebot-ui
COPY ./bytebot-ui/package.json ./bytebot-ui/package-lock.json* ./
RUN npm ci

# ============================================
# Stage 2: Builder Stage
# ============================================
FROM node:20-bullseye AS builder

# Build arguments for Next.js
ARG BYTEBOT_AGENT_BASE_URL
ARG BYTEBOT_DESKTOP_VNC_URL

ENV BYTEBOT_AGENT_BASE_URL=${BYTEBOT_AGENT_BASE_URL}
ENV BYTEBOT_DESKTOP_VNC_URL=${BYTEBOT_DESKTOP_VNC_URL}

WORKDIR /build

# Copy dependencies
COPY --from=deps /build/shared ./shared
COPY --from=deps /build/bytebot-ui/node_modules ./bytebot-ui/node_modules

# Copy source code
COPY ./bytebot-ui ./bytebot-ui
WORKDIR /build/bytebot-ui

# Build Next.js application
RUN npm run build

# Compile server.ts to JavaScript using esbuild
RUN npx esbuild server.ts \
    --bundle \
    --platform=node \
    --target=node20 \
    --outfile=server.js \
    --external:next \
    --external:express \
    --external:http-proxy \
    --external:http-proxy-middleware \
    --external:dotenv

# ============================================
# Stage 3: Runtime Stage (Distroless)
# ============================================
FROM gcr.io/distroless/nodejs20-debian12:nonroot

WORKDIR /app

# Copy shared module
COPY --from=builder --chown=nonroot:nonroot /build/shared/dist ./shared/dist
COPY --from=builder --chown=nonroot:nonroot /build/shared/package.json ./shared/package.json
COPY --from=builder --chown=nonroot:nonroot /build/shared/node_modules ./shared/node_modules

# Copy Next.js build output
COPY --from=builder --chown=nonroot:nonroot /build/bytebot-ui/.next ./.next
COPY --from=builder --chown=nonroot:nonroot /build/bytebot-ui/public ./public
COPY --from=builder --chown=nonroot:nonroot /build/bytebot-ui/package.json ./package.json

# Copy compiled server
COPY --from=builder --chown=nonroot:nonroot /build/bytebot-ui/server.js ./server.js

# Copy node_modules (production dependencies)
COPY --from=builder --chown=nonroot:nonroot /build/bytebot-ui/node_modules ./node_modules

# Copy next.config if needed by Next.js at runtime
COPY --from=builder --chown=nonroot:nonroot /build/bytebot-ui/next.config.ts ./next.config.ts

# Distroless runs as nonroot (UID 65532) by default
USER nonroot

# Expose port
EXPOSE 9992

# Run compiled server.js (node is the default entrypoint in nodejs distroless)
CMD ["/app/server.js"]
