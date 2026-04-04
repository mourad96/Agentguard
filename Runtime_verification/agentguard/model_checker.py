"""
Probabilistic Model Checker — wraps Storm / stormpy.

Provides two modes:
  • **Mock mode** (default): parses the PRISM model structure and returns
    synthetic but structurally plausible verification results.  This lets
    the POC run on any platform without the Storm C++ dependency.
  • **Storm mode**: uses the ``stormpy`` Python bindings to build the
    model and check PCTL properties.  Requires Storm to be installed.
"""

from __future__ import annotations

import logging
import os
import re
import random
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, List, Optional

logger = logging.getLogger("agentguard.checker")


# ──────────────────────────────────────────────────────────────────────
# Result container
# ──────────────────────────────────────────────────────────────────────

@dataclass
class CheckResult:
    """Outcome of verifying a single PCTL property."""
    property_name: str
    pctl: str
    value: float              # e.g. probability or expected reward
    raw: Optional[Any] = None # backend-specific detail


# ──────────────────────────────────────────────────────────────────────
# Abstract base
# ──────────────────────────────────────────────────────────────────────

class _BaseChecker:
    def check(
        self, prism_model: str, properties: list[dict]
    ) -> List[CheckResult]:
        raise NotImplementedError


# ──────────────────────────────────────────────────────────────────────
# Mock checker
# ──────────────────────────────────────────────────────────────────────

class MockChecker(_BaseChecker):
    """
    Lightweight mock that analyses the PRISM model *structurally* to
    produce plausible verification results without Storm.

    It parses the model text to extract basic statistics (number of
    states, transitions, goal/error reachability) and uses them to
    generate realistic-looking values.
    """

    def check(
        self, prism_model: str, properties: list[dict]
    ) -> List[CheckResult]:
        info = self._parse_model_info(prism_model)
        results: list[CheckResult] = []

        for prop in properties:
            value = self._estimate(prop, info)
            results.append(
                CheckResult(
                    property_name=prop["name"],
                    pctl=prop["pctl"],
                    value=round(value, 4),
                    raw={"mode": "mock", "model_info": info},
                )
            )
        return results

    # ── Heuristic estimator ───────────────────────────────────────────

    def _estimate(self, prop: dict, info: dict) -> float:
        pctl: str = prop["pctl"]

        # Probability queries  ->  return value in [0, 1]
        if "Pmax" in pctl or "Pmin" in pctl:
            if '"Fix_Success"' in pctl or '"goal"' in pctl:
                # More transitions toward goal -> higher probability
                goal_ratio = info["goal_transitions"] / max(info["total_transitions"], 1)
                base = 0.5 + 0.5 * goal_ratio
            elif '"error"' in pctl or '"Error"' in pctl:
                error_ratio = info["error_transitions"] / max(info["total_transitions"], 1)
                base = error_ratio
            elif 'G !' in pctl:
                # Probability of globally NOT doing something -> low (agent usually does it)
                base = random.uniform(0.02, 0.12)
            else:
                base = random.uniform(0.3, 0.9)
            # Add small noise
            return max(0.0, min(1.0, base + random.uniform(-0.05, 0.05)))

        # Reward / expected-value queries  ->  return value >= 0
        if "Rmin" in pctl or "Rmax" in pctl:
            # Expected number of steps/cycles to reach goal
            return float(info["n_states"]) * 1.5 + random.uniform(0, 5)

        return random.uniform(0.0, 1.0)

    # ── Lightweight PRISM parser ──────────────────────────────────────

    @staticmethod
    def _parse_model_info(prism_model: str) -> dict:
        n_states = len(re.findall(r"s'=\d+", prism_model))
        total_cmds = len(re.findall(r"\[.*?\]", prism_model))
        has_goal = '"goal"' in prism_model or '"Fix_Success"' in prism_model
        has_error = '"error"' in prism_model or '"Error"' in prism_model

        # Count transitions involving goal / error labels
        goal_trans = prism_model.count('"goal"') + prism_model.count('"Fix_Success"')
        error_trans = prism_model.count('"error"') + prism_model.count('"Error"')

        return {
            "n_states": max(n_states, 1),
            "total_transitions": max(total_cmds, 1),
            "has_goal": has_goal,
            "has_error": has_error,
            "goal_transitions": goal_trans,
            "error_transitions": error_trans,
        }


# ──────────────────────────────────────────────────────────────────────
# Storm checker (requires stormpy)
# ──────────────────────────────────────────────────────────────────────

class StormChecker(_BaseChecker):
    """Real model checker backed by ``stormpy``."""

    def __init__(self) -> None:
        try:
            import stormpy  # type: ignore
            self._stormpy = stormpy
        except ImportError as exc:
            raise ImportError(
                "stormpy is not installed.  Install Storm and stormpy or "
                "set use_storm=false in config.yaml to use mock mode."
            ) from exc

    def check(
        self, prism_model: str, properties: list[dict]
    ) -> List[CheckResult]:
        sp = self._stormpy

        # Write model to a temp file (stormpy needs a file path)
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".prism", delete=False, encoding="utf-8"
        ) as tmp:
            tmp.write(prism_model)
            tmp_path = tmp.name

        try:
            prism_program = sp.parse_prism_program(tmp_path)
            results: list[CheckResult] = []

            for prop in properties:
                pctl_str = prop["pctl"]
                sp_props = sp.parse_properties(pctl_str, prism_program)
                model = sp.build_model(prism_program, sp_props)
                result = sp.model_checking(model, sp_props[0])
                init_state = model.initial_states[0]
                value = float(result.at(init_state))
                results.append(
                    CheckResult(
                        property_name=prop["name"],
                        pctl=pctl_str,
                        value=round(value, 6),
                        raw={"mode": "storm", "model_states": model.nr_states},
                    )
                )
            return results
        finally:
            Path(tmp_path).unlink(missing_ok=True)


# ──────────────────────────────────────────────────────────────────────
# Factory
# ──────────────────────────────────────────────────────────────────────

def create_checker(use_storm: bool = False) -> _BaseChecker:
    """Return the appropriate checker backend."""
    if use_storm or os.environ.get("AGENTGUARD_USE_STORM", "").strip() == "1":
        logger.info("Using Storm model checker (stormpy)")
        return StormChecker()
    logger.info("Using mock model checker")
    return MockChecker()
