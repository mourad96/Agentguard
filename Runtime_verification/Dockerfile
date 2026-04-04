# ──────────────────────────────────────────────────────────────────────
# AgentGuard Runtime Verification — Docker Image
# ──────────────────────────────────────────────────────────────────────
# This image includes the Storm model checker and stormpy bindings so
# that formal verification runs with the real engine.
#
# Build:          docker build -t agentguard-rv .
# Run (Default):  MSYS_NO_PATHCONV=1 docker run --rm -v "${PWD}:/app" agentguard-rv
# Run (Liquid):   MSYS_NO_PATHCONV=1 docker run --rm -v "${PWD}:/app" agentguard-rv liquidation
# ──────────────────────────────────────────────────────────────────────

FROM movesrwth/stormpy:stable

WORKDIR /app

# Install Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Project setup
COPY . .
RUN chmod +x entrypoint.sh

# Enable real Storm checker
ENV AGENTGUARD_USE_STORM=1

# Entrypoint script with "demo" or "liquidation" as options
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["demo"]
