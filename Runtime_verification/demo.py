#!/usr/bin/env python3
"""
AgentGuard — Proof-of-Concept Demo
═══════════════════════════════════
Simulates a "Research Agent" that:
  1. Searches for information
  2. Summarises results
  3. Writes a report
  4. Finishes (or occasionally errors out)

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

# ── Ensure the package is importable when running from this directory ──
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from agentguard import AgentGuardLogger
from agentguard.actuator import ThresholdResult


# ──────────────────────────────────────────────────────────────────────
# Logging setup
# ──────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(name)-24s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("demo")


# ── Fix Windows Unicode issues ──────────────────────────────────────────
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# ──────────────────────────────────────────────────────────────────────
# Actuator callbacks
# ──────────────────────────────────────────────────────────────────────

def on_alert(result: ThresholdResult):
    """Fires when a property breaches its threshold (warning level)."""
    print(
        f"\n  [!] ALERT: '{result.check.property_name}' = {result.check.value:.4f} "
        f"(threshold: {result.threshold}, dir: {result.direction})\n"
    )


def on_intervene(result: ThresholdResult):
    """Fires on critical breaches — could stop the agent in production."""
    print(
        f"\n  [X] INTERVENTION: '{result.check.property_name}' = {result.check.value:.4f} "
        f"critically breaches threshold {result.threshold}!"
        f"\n      -> In production this would HALT the agent.\n"
    )


# ──────────────────────────────────────────────────────────────────────
# Simulated Research Agent
# ──────────────────────────────────────────────────────────────────────

class ResearchAgent:
    """
    A mock agent that transitions through states with some randomness.

    Transition probabilities (by design):
      idle       → searching    (search)      — always
      searching  → summarizing  (summarize)   — 70 %
      searching  → error        (fail)        — 15 %
      searching  → searching    (retry)       — 15 %
      summarizing→ writing      (write)       — 80 %
      summarizing→ error        (fail)        — 10 %
      summarizing→ searching    (retry)       — 10 %
      writing    → done         (finish)      — 85 %
      writing    → error        (fail)        — 10 %
      writing    → summarizing  (retry)       — 5 %
      error      → idle         (retry)       — 100 %
    """

    TRANSITIONS = {
        "idle": [
            ("search", "searching", 1.00),
        ],
        "searching": [
            ("summarize", "summarizing", 0.70),
            ("fail", "error", 0.15),
            ("retry", "searching", 0.15),
        ],
        "summarizing": [
            ("write", "writing", 0.80),
            ("fail", "error", 0.10),
            ("retry", "searching", 0.10),
        ],
        "writing": [
            ("finish", "done", 0.85),
            ("fail", "error", 0.10),
            ("retry", "summarizing", 0.05),
        ],
        "error": [
            ("retry", "idle", 1.00),
        ],
    }

    def __init__(self) -> None:
        self.state = "idle"

    def step(self) -> tuple[str, str, str] | None:
        """Take one step.  Returns (from, action, to) or None if done."""
        if self.state == "done":
            return None

        choices = self.TRANSITIONS[self.state]
        actions, targets, weights = zip(*choices)
        idx = random.choices(range(len(choices)), weights=weights, k=1)[0]
        action, next_state = actions[idx], targets[idx]

        prev = self.state
        self.state = next_state
        return (prev, action, next_state)


# ──────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────

def main() -> None:
    print("=" * 60)
    print("  AgentGuard -- Proof of Concept Demo")
    print("=" * 60)
    print()
    print("  This demo simulates a Research Agent while AgentGuard")
    print("  monitors every transition and verifies safety properties")
    print("  in the background.\n")

    config_path = os.path.join(os.path.dirname(__file__), "config.yaml")
    guard = AgentGuardLogger(
        config_path=config_path,
        on_alert=on_alert,
        on_intervene=on_intervene,
    )

    agent = ResearchAgent()

    max_steps = 25
    step_count = 0

    for i in range(max_steps):
        result = agent.step()
        if result is None:
            print(f"\n  [v] Agent reached terminal state 'done' after {step_count} steps.")
            break

        from_state, action, to_state = result
        step_count += 1

        print(f"  [{step_count:>2}]  {from_state:<15}  --{action}-->  {to_state}")

        # Log the transition to AgentGuard (near-instant, non-blocking)
        guard.log_transition(from_state, action, to_state)

        # Simulate real work
        time.sleep(0.3)
    else:
        print(f"\n  [#] Max steps ({max_steps}) reached -- agent did not finish.")

    # ── Shutdown: flush queue and run final verification ──────────────
    print("\n  Shutting down AgentGuard ...")
    guard.shutdown(timeout=10.0)

    # ── Show the generated PRISM model ────────────────────────────────
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
