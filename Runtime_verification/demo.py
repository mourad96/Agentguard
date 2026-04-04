#!/usr/bin/env python3
"""
AgentGuard -- Proof-of-Concept Demo
=====================================
Simulates an "AgentGuard" that:
  1. Reads a file to analyse the problem (Init -> Analyzing)
  2. Attempts to write a fix (Analyzing -> Fixing)
  3. Runs tests to validate the fix
     - 50% success  -> Fix_Success
     - 50% failure  -> Fix_Failed
  4. On success, finalises the run
  5. On failure or error, reads the file again to retry

AgentGuard sits as invisible middleware, monitoring every transition and
periodically running formal verification in the background.

Usage:
    python demo.py
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
    """Fires when a property breaches its threshold (warning level)."""
    print(
        f"\n  [!] ALERT: '{result.check.property_name}' = {result.check.value:.4f} "
        f"(threshold: {result.threshold}, dir: {result.direction})\n"
    )


def on_intervene(result: ThresholdResult):
    """Fires on critical breaches -- could stop the agent in production."""
    print(
        f"\n  [X] INTERVENTION: '{result.check.property_name}' = {result.check.value:.4f} "
        f"critically breaches threshold {result.threshold}!"
        f"\n      -> In production this would HALT the agent.\n"
    )


# Simulated AgentGuard
# ----------------------------------------------------------------------

class AgentGuardSim:
    """
    A mock agent that transitions through states with designed probabilities.

    Transition probabilities:
      Opportunity_Spotted -> TX_Construction   (fetch_data)  -- always
      TX_Construction     -> On_Chain_Revert   (submit_tx)   -- failures
                          or TX_Confirmed      (submit_tx)   -- 50/50 success
      TX_Confirmed        -> Opportunity_Spotted (finalize)  -- always (loop or done)
      On_Chain_Revert     -> TX_Construction   (fetch_data)  -- always (retry loop)
      Network_Error       -> Opportunity_Spotted (fetch_data)-- always (recover)
    """

    TRANSITIONS = {
        # From Opportunity_Spotted: always fetch data
        "Opportunity_Spotted": [
            ("fetch_data", "TX_Construction", 1.00),
        ],
        # From TX_Construction:
        "TX_Construction": [
            ("submit_tx", "TX_Confirmed", 0.50),
            ("submit_tx", "On_Chain_Revert",  0.25),
            ("submit_tx", "Network_Error",       0.25),
        ],
        # From TX_Confirmed: finalise
        "TX_Confirmed": [
            ("finalize", "Opportunity_Spotted", 1.00),
        ],
        # From On_Chain_Revert: retry
        "On_Chain_Revert": [
            ("fetch_data", "TX_Construction", 1.00),
        ],
        # From Network_Error: recover
        "Network_Error": [
            ("fetch_data", "Opportunity_Spotted", 1.00),
        ],
    }

    def __init__(self) -> None:
        self.state = "Opportunity_Spotted"
        self.successes = 0
        self.max_successes = 3   # stop after 3 successful repairs

    def step(self) -> tuple[str, str, str] | None:
        """Take one step. Returns (from, action, to) or None when done."""
        # Terminal condition: achieved enough successes
        if self.successes >= self.max_successes:
            return None

        choices = self.TRANSITIONS.get(self.state)
        if choices is None:
            return None

        actions, targets, weights = zip(*choices)
        idx = random.choices(range(len(choices)), weights=weights, k=1)[0]
        action, next_state = actions[idx], targets[idx]

        prev = self.state
        self.state = next_state

        if next_state == "TX_Confirmed":
            self.successes += 1

        return (prev, action, next_state)


# ----------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------

def main() -> None:
    print("=" * 60)
    print("  AgentGuard -- Demo")
    print("=" * 60)
    print()
    print("  Simulates an AgentGuard monitored by the framework.")
    print("  Formal verification runs every N transitions.\n")

    config_path = os.path.join(os.path.dirname(__file__), "config.yaml")
    guard = AgentGuardLogger(
        config_path=config_path,
        on_alert=on_alert,
        on_intervene=on_intervene,
    )

    agent = AgentGuardSim()

    max_steps = 40
    step_count = 0

    for i in range(max_steps):
        result = agent.step()
        if result is None:
            print(
                f"\n  [v] AgentGuard completed {agent.successes} liquidations "
                f"after {step_count} steps."
            )
            break

        from_state, action, to_state = result
        step_count += 1

        print(f"  [{step_count:>2}]  {from_state:<15}  --{action}-->  {to_state}")

        # Log the transition to AgentGuard (near-instant, non-blocking)
        guard.log_transition(from_state, action, to_state)

        # Simulate real work
        time.sleep(0.2)
    else:
        print(f"\n  [#] Max steps ({max_steps}) reached -- agent did not finish.")

    # -- Shutdown: flush queue and run final verification ---------------
    print("\n  Shutting down AgentGuard ...")
    guard.shutdown(timeout=10.0)

    # -- Show the generated PRISM model ---------------------------------
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

    print("\n  [v] Demo complete.\n")


if __name__ == "__main__":
    main()
