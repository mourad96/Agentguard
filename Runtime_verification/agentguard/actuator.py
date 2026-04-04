"""
Assurance Dashboard & Actuator.

Presents verification results in a human-readable dashboard and
triggers user-defined callbacks when safety thresholds are breached.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Callable, Dict, List, Optional

from agentguard.config_loader import PropertyDefinition
from agentguard.model_checker import CheckResult

logger = logging.getLogger("agentguard.actuator")


# ──────────────────────────────────────────────────────────────────────
# Threshold evaluation
# ──────────────────────────────────────────────────────────────────────

@dataclass
class ThresholdResult:
    """Associates a check result with its threshold evaluation."""
    check: CheckResult
    threshold: Optional[float]
    direction: str               # "above" or "below"
    passed: bool
    severity: str                # "ok", "warning", "critical"


# ──────────────────────────────────────────────────────────────────────
# Actuator
# ──────────────────────────────────────────────────────────────────────

class Actuator:
    """
    Receives model-checking results, evaluates them against thresholds,
    prints a dashboard, and fires callbacks.

    Callbacks
    ─────────
    * ``on_alert(result: ThresholdResult)`` — fired for each *warning*.
    * ``on_intervene(result: ThresholdResult)`` — fired for each
      *critical* breach (when the deviation exceeds 2× tolerance).
    """

    def __init__(
        self,
        property_defs: List[PropertyDefinition],
        on_alert: Optional[Callable[[ThresholdResult], None]] = None,
        on_intervene: Optional[Callable[[ThresholdResult], None]] = None,
    ) -> None:
        self._prop_map: Dict[str, PropertyDefinition] = {
            p.name: p for p in property_defs
        }
        self._on_alert = on_alert
        self._on_intervene = on_intervene

    # ── Public API ────────────────────────────────────────────────────

    def process(self, results: List[CheckResult]) -> List[ThresholdResult]:
        """Evaluate *results* and print the dashboard."""
        evaluated = [self._evaluate(r) for r in results]
        self._print_dashboard(evaluated)
        self._fire_callbacks(evaluated)
        return evaluated

    # ── Internals ─────────────────────────────────────────────────────

    def _evaluate(self, result: CheckResult) -> ThresholdResult:
        prop_def = self._prop_map.get(result.property_name)
        if prop_def is None or prop_def.threshold is None:
            return ThresholdResult(
                check=result,
                threshold=None,
                direction="above",
                passed=True,
                severity="ok",
            )

        threshold = prop_def.threshold
        direction = prop_def.direction

        if direction == "above":
            passed = result.value >= threshold
            deviation = threshold - result.value if not passed else 0
        else:  # "below"
            passed = result.value <= threshold
            deviation = result.value - threshold if not passed else 0

        # Severity: warning if breached, critical if deviation > 2× tolerance
        if passed:
            severity = "ok"
        elif deviation > abs(threshold) * 0.5:
            severity = "critical"
        else:
            severity = "warning"

        return ThresholdResult(
            check=result,
            threshold=threshold,
            direction=direction,
            passed=passed,
            severity=severity,
        )

    def _print_dashboard(self, evaluated: List[ThresholdResult]) -> None:
        ICONS = {"ok": "✅", "warning": "⚠️ ", "critical": "🛑"}
        COLORS = {
            "ok": "\033[92m",       # green
            "warning": "\033[93m",  # yellow
            "critical": "\033[91m", # red
        }
        RESET = "\033[0m"
        BOLD = "\033[1m"
        DIM = "\033[2m"

        width = 78
        print(f"\n{BOLD}{'═' * width}{RESET}")
        print(f"{BOLD}  🛡️  AgentGuard — Assurance Dashboard{RESET}")
        print(f"{BOLD}{'═' * width}{RESET}")

        # Header row
        print(
            f"  {'Property':<28} {'Value':>10} {'Threshold':>12} "
            f"{'Dir':>6} {'Status':>8}"
        )
        print(f"  {'─' * 70}")

        for tr in evaluated:
            icon = ICONS[tr.severity]
            color = COLORS[tr.severity]
            thresh_str = (
                f"{tr.threshold}" if tr.threshold is not None else "  —"
            )
            dir_str = tr.direction if tr.threshold is not None else "  —"
            print(
                f"  {tr.check.property_name:<28} "
                f"{color}{tr.check.value:>10.4f}{RESET} "
                f"{thresh_str:>12} {dir_str:>6}  {icon}"
            )

        print(f"{DIM}{'─' * width}{RESET}\n")

    def _fire_callbacks(self, evaluated: List[ThresholdResult]) -> None:
        for tr in evaluated:
            if tr.severity == "warning" and self._on_alert:
                self._on_alert(tr)
            elif tr.severity == "critical" and self._on_intervene:
                self._on_intervene(tr)
            elif tr.severity == "critical" and self._on_alert:
                # Fall back to alert if no intervene handler
                self._on_alert(tr)
