#!/bin/bash
set -e

if [ "$#" -eq 0 ] || [ "$1" = "defi" ]; then
    echo "--- Running Hedera DeFi Agent (AgentGuard + Storm) ---"
    exec python hedera_defi_agent.py
elif [ "$1" = "liquidation" ]; then
    echo "--- Running Hedera Liquidation Agent (AgentGuard + Storm) ---"
    exec python hedera_liquidation_agent.py
else
    exec "$@"
fi
