FROM mcr.microsoft.com/devcontainers/typescript-node:20

# Install system dependencies
RUN apt-get update && apt-get install -y \
    sqlite3 \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI (gh)
RUN curl -fsSL "$(curl -s https://api.github.com/repos/cli/cli/releases/latest | grep 'browser_download_url.*linux_amd64.tar.gz"' | cut -d'"' -f4)" | \
    tar -xz -C /tmp && \
    mv /tmp/gh_*/bin/gh /usr/local/bin/ && \
    rm -rf /tmp/gh_*

# Install agor-live from npm (much faster than building from source!)
RUN npm install -g agor-live@latest @anthropic-ai/claude-code@latest @google/gemini-cli@latest @openai/codex@latest

WORKDIR /workspace

# Run as root for simplified sandbox
