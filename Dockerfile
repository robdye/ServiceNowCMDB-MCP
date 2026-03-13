# Stage 1: Build the UI
FROM node:20-alpine AS ui-builder
WORKDIR /build/ui/ci-explorer
COPY ui/ci-explorer/package.json ui/ci-explorer/package-lock.json* ./
RUN npm ci --ignore-scripts
COPY ui/ci-explorer/ ./
RUN npm run build

# Stage 2: Production Python runtime
FROM python:3.13-slim AS production
WORKDIR /app

# Create non-root user
RUN groupadd --gid 1001 appuser && \
    useradd --uid 1001 --gid 1001 --create-home appuser

# Install Python dependencies first (layer caching)
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY server.py ./

# Copy built UI from stage 1
COPY --from=ui-builder /build/ui/ci-explorer/dist/ ./ui/ci-explorer/dist/

# Set ownership
RUN chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Expose the server port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# Start the MCP server
CMD ["python", "server.py"]
