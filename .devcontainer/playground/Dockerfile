FROM mcr.microsoft.com/devcontainers/typescript-node:20 AS builder

# Install system dependencies
RUN apt-get update && apt-get install -y \
    sqlite3 \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN npm install -g pnpm@9.15.1

# Set working directory
WORKDIR /build

# Copy entire repo (simpler, works with Docker context)
COPY . .

# Install dependencies and build
# Note: Not using --frozen-lockfile to allow flexibility in sandbox environment
RUN pnpm install && pnpm -r build

# Production stage
FROM mcr.microsoft.com/devcontainers/typescript-node:20

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    sqlite3 \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm and AI CLIs
RUN npm install -g pnpm@9.15.1 @anthropic-ai/claude-code @google/gemini-cli @openai/codex

# Copy built artifacts from builder
WORKDIR /app
COPY --from=builder /build .

# Set working directory
WORKDIR /workspaces/agor

# Run as root for simplified sandbox
# Docker access works out of the box in Codespaces
