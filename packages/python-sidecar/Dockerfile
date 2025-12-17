# ============================================
# Stage 1: Builder Stage
# ============================================
FROM python:3.11-slim AS builder

WORKDIR /build

# Install build dependencies for native extensions
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies to a custom prefix
COPY pyproject.toml ./
RUN pip install --no-cache-dir --prefix=/install .

# ============================================
# Stage 2: Runtime Stage (Distroless)
# ============================================
FROM gcr.io/distroless/python3-debian12:nonroot

# Copy Python packages from builder
COPY --from=builder --chown=nonroot:nonroot /install/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages

# Copy application source
COPY --chown=nonroot:nonroot src/ /app/src/

# Set working directory
WORKDIR /app

# Distroless runs as nonroot (UID 65532) by default
USER nonroot

# Expose port
EXPOSE 8766

# Run server using Python from distroless
# Note: Distroless Python image has python3 as default entrypoint
ENTRYPOINT ["python3"]
CMD ["-m", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8766"]
