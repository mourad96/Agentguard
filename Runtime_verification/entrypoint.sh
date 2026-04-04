#!/bin/bash
set -e

# Support "demo" or "liquidation" as the first argument.
# Default to "demo" if no arguments are provided.

if [ "$#" -eq 0 ] || [ "$1" = "demo" ]; then
    echo "--- Running AgentGuard Demo (Default) ---"
    exec python demo.py
elif [ "$1" = "liquidation" ]; then
    echo "--- Running AgentGuard Liquidation Demo ---"
    exec python demo_liquidation.py
else
    # Allow running custom commands (like bash or python directly)
    exec "$@"
fi
