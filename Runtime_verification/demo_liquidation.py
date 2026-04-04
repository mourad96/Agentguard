#!/usr/bin/env python3
"""
Liquidation Bot Demo -- Proof-of-Concept
========================================
Simulates a Transaction Execution Agent that can get stuck in a "Reversion Loop".
"""

from __future__ import annotations

import logging
import os
import random
import sys
import time

# -- Ensure the package is importable when running from this directory --
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# -- Fix Windows Unicode issues ------------------------------------------
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

from agentguard import AgentGuardLogger
from agentguard.actuator import ThresholdResult

# ----------------------------------------------------------------------
# Logging setup
# ----------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(name)-24s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("demo")

# ----------------------------------------------------------------------
# Actuator callbacks
# ----------------------------------------------------------------------

def on_alert(result: ThresholdResult):
    print(
        f"\n  [!] ALERT: '{result.check.property_name}' = {result.check.value:.4f} "
        f"(threshold: {result.threshold}, dir: {result.direction})\n"
    )

def on_intervene(result: ThresholdResult):
    print(
        f"\n  [X] INTERVENTION: '{result.check.property_name}' = {result.check.value:.4f} "
        f"critically breaches threshold {result.threshold}!"
        f"\n      -> HALTING LIQUIDATION BOT TO PREVENT GAS DRAIN.\n"
    )
    # Physically halt the demo
    sys.exit(1)

# ----------------------------------------------------------------------
# Simulated Liquidation Agent
# ----------------------------------------------------------------------

class LiquidationBotSim:
    """
    A mock liquidation bot getting stuck in a reversion loop.
    """

    TRANSITIONS = {
        # Opportunity_Spotted -> TX_Construction (fetch_data)
        "Opportunity_Spotted": [
            ("fetch_data", "TX_Construction", 1.00),
        ],
        # TX_Construction -> (submit_tx)
        "TX_Construction": [
            ("submit_tx", "Network_Error", 0.05),
            ("submit_tx", "On_Chain_Revert", 0.90),  # 90% chance of reverting -> Loop!
            ("submit_tx", "TX_Confirmed", 0.05),
        ],
        # On_Chain_Revert -> TX_Construction (adjust_params)
        "On_Chain_Revert": [
            ("adjust_params", "TX_Construction", 1.00),
        ],
        # Network_Error -> Opportunity_Spotted (fetch_data)
        "Network_Error": [
            ("fetch_data", "Opportunity_Spotted", 1.00),
        ],
        # TX_Confirmed -> Terminal
        "TX_Confirmed": [
            # End state
        ]
    }

    def __init__(self) -> None:
        self.state = "Opportunity_Spotted"

    def step(self) -> tuple[str, str, str] | None:
        choices = self.TRANSITIONS.get(self.state)
        if not choices:
            return None

        actions, targets, weights = zip(*choices)
        idx = random.choices(range(len(choices)), weights=weights, k=1)[0]
        action, next_state = actions[idx], targets[idx]

        prev = self.state
        self.state = next_state
        return (prev, action, next_state)

# ----------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------

def main() -> None:
    print("=" * 60)
    print("  Liquidation Bot Demo -- Stuck in Loop Scenario")
    print("=" * 60)
    print()

    config_path = os.path.join(os.path.dirname(__file__), "config_liquidation.yaml")
    guard = AgentGuardLogger(
        config_path=config_path,
        on_alert=on_alert,
        on_intervene=on_intervene,
    )

    agent = LiquidationBotSim()
    max_steps = 100
    step_count = 0

    try:
        for i in range(max_steps):
            result = agent.step()
            if result is None:
                print(f"\n  [v] Liquidation completed after {step_count} steps.")
                break

            from_state, action, to_state = result
            step_count += 1
            print(f"  [{step_count:>2}]  {from_state:<20}  --{action:<15}-->  {to_state}")

            guard.log_transition(from_state, action, to_state)
            time.sleep(0.5)  # Simulate real work and time between on-chain responses
        else:
            print(f"\n  [#] Max steps ({max_steps}) reached.")
    except SystemExit:
        pass
    finally:
        print("\n  Shutting down AgentGuard ...")
        guard.shutdown(timeout=10.0)

        prism_path = os.path.join(
            os.path.dirname(__file__),
            guard.config.verification.prism_output,
        )
        if os.path.exists(prism_path):
            print(f"\n{'=' * 60}")
            print(f"  [i] Generated PRISM model: {prism_path}")
            print(f"{'=' * 60}")
            with open(prism_path, "r", encoding="utf-8") as f:
                print(f.read())

if __name__ == "__main__":
    main()
