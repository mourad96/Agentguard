#!/usr/bin/env python3
"""
Liquidation Bot Demo -- Proof-of-Concept
=========================================
Demonstrates AgentGuard detecting a "reversion loop" starting from a
previously healthy model.

Scenario
--------
  The previous run's PRISM model (latest_model.prism) is loaded as a
  lightweight baseline (seed_weight=5, ~30 virtual transitions) showing
  healthy probabilities (~50 % TX_Confirmed per attempt).

  The demo then simulates a degraded market: every submit_tx hits
  On_Chain_Revert 90 % of the time.  As new observations accumulate, they
  dilute the healthy seed and the expected-cycles metric climbs:

    • Verification 1 (t=5)   →  E[cycles] ≈ 6-7   — OK
    • Verification 2 (t=10)  →  E[cycles] ≈ 9-10  — OK  (approaching)
    • Verification 3 (t=15)  →  E[cycles] ≈ 12-14 — WARNING  (on_alert)
    • Verification 4 (t=20)  →  E[cycles] ≈ 15-18 — CRITICAL (on_intervene → halt)
"""

from __future__ import annotations

import logging
import os
import random
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

from agentguard import AgentGuardLogger
from agentguard.actuator import ThresholdResult

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(name)-24s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("demo")

# ── Actuator callbacks ────────────────────────────────────────────────

_HALT_BOT = False


def on_alert(result: ThresholdResult) -> None:
    print(
        f"\n  [!] ALERT: '{result.check.property_name}' = {result.check.value:.4f} "
        f"(threshold: {result.threshold}, dir: {result.direction})\n"
        f"      -> Rising expected cycles signal the bot is drifting into a revert loop.\n"
    )


def on_intervene(result: ThresholdResult) -> None:
    global _HALT_BOT
    print(
        f"\n  [X] INTERVENTION: '{result.check.property_name}' = {result.check.value:.4f} "
        f"critically breaches threshold {result.threshold}!"
        f"\n      -> HALTING LIQUIDATION BOT TO PREVENT GAS DRAIN.\n"
    )
    _HALT_BOT = True


# ── Simulated Liquidation Agent (degraded / stuck mode) ──────────────

class LiquidationBotSim:
    """
    Simulates a liquidation bot stuck in a reversion loop.

    submit_tx outcomes (degraded market conditions):
      90 % → On_Chain_Revert   (stuck loop)
       5 % → TX_Confirmed      (lucky break)
       5 % → Network_Error
    """

    TRANSITIONS = {
        "Opportunity_Spotted": [
            ("fetch_data", "TX_Construction", 1.00),
        ],
        "TX_Construction": [
            ("submit_tx", "Network_Error",   0.05),
            ("submit_tx", "On_Chain_Revert", 0.90),  # ← stuck in a loop
            ("submit_tx", "TX_Confirmed",    0.05),
        ],
        "On_Chain_Revert": [
            ("adjust_params", "TX_Construction", 1.00),
        ],
        "Network_Error": [
            ("fetch_data", "Opportunity_Spotted", 1.00),
        ],
        # finalize loops the bot back so it keeps running even on lucky confirms
        "TX_Confirmed": [
            ("finalize", "Opportunity_Spotted", 1.00),
        ],
    }

    def __init__(self) -> None:
        self.state = "Opportunity_Spotted"

    def step(self) -> tuple[str, str, str]:
        choices = self.TRANSITIONS[self.state]
        actions, targets, weights = zip(*choices)
        idx = random.choices(range(len(choices)), weights=weights, k=1)[0]
        action, next_state = actions[idx], targets[idx]
        prev, self.state = self.state, next_state
        return (prev, action, next_state)


# ── Main ──────────────────────────────────────────────────────────────

def main() -> None:
    print("=" * 60)
    print("  Liquidation Bot Demo -- Stuck in Loop Scenario")
    print("=" * 60)
    print()
    print("  Baseline : previous healthy model (latest_model.prism)")
    print("  Scenario : 90 % On_Chain_Revert per submission")
    print("  Watch    : E[cycles] rise as new observations dilute")
    print("             the healthy seed → AgentGuard intervenes")
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
        for _ in range(max_steps):
            if _HALT_BOT:
                break

            from_state, action, to_state = agent.step()
            step_count += 1
            print(f"  [{step_count:>2}]  {from_state:<22} --{action:<15}-->  {to_state}")

            guard.log_transition(from_state, action, to_state)
            time.sleep(0.4)
        else:
            print(f"\n  [#] Max steps ({max_steps}) reached without AgentGuard intervention.")

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
            print(f"  [i] Updated PRISM model: {prism_path}")
            print(f"{'=' * 60}")
            with open(prism_path, "r", encoding="utf-8") as f:
                print(f.read())


if __name__ == "__main__":
    main()
