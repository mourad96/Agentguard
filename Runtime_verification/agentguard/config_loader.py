"""
Configuration loader for AgentGuard.

Reads and validates the YAML configuration file that defines the agent's
semantic states, actions, PCTL properties, and verification settings.

New flat schema (top-level keys):
  agent:
    name: str
    verification_interval: int
  states: [str, ...]
  actions: [str, ...]
  properties:
    <key>: <pctl_string>
  safety_thresholds:
    min_prob_success: float
    max_expected_cycles: float
    max_prob_missing_critical: float
"""

from __future__ import annotations

import yaml
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional


# ----------------------------------------------------------------------
# Data classes
# ----------------------------------------------------------------------

@dataclass
class PropertyDefinition:
    """A PCTL property to verify, with an optional threshold."""
    name: str        # key from the properties map
    pctl: str        # raw PCTL formula string
    threshold: Optional[float] = None
    direction: str = "above"   # "above" or "below"


@dataclass
class SafetyThresholds:
    """Safety threshold values read from the config."""
    min_prob_success: float = 0.8
    max_expected_cycles: float = 50.0
    max_prob_missing_critical: float = 0.1


@dataclass
class AgentGuardConfig:
    """Top-level configuration object."""
    agent_name: str = "Agent"
    verification_interval: int = 10
    states: List[str] = field(default_factory=list)
    actions: List[str] = field(default_factory=list)
    properties: List[PropertyDefinition] = field(default_factory=list)
    thresholds: SafetyThresholds = field(default_factory=SafetyThresholds)
    prism_output: str = "latest_model.prism"
    use_storm: bool = False
    reward_name: str = "cycles"

    # ── Convenience helpers ───────────────────────────────────────────

    @property
    def initial_state(self) -> str:
        """First state in the list is considered the initial state."""
        return self.states[0] if self.states else "Init"

    @property
    def goal_states(self) -> List[str]:
        """States containing 'success' or 'done' in their name (case-insensitive)."""
        return [s for s in self.states if "success" in s.lower() or "done" in s.lower()]

    @property
    def error_states(self) -> List[str]:
        """States containing 'error' or 'failed' in their name (case-insensitive)."""
        return [s for s in self.states if "error" in s.lower() or "failed" in s.lower()]

    @property
    def state_names(self) -> List[str]:
        return list(self.states)

    # ── Backward-compat shim used by analyzer ─────────────────────────
    class _VerifCompat:
        def __init__(self, interval: int, use_storm: bool, prism_output: str):
            self.check_interval = interval
            self.use_storm = use_storm
            self.prism_output = prism_output

    @property
    def verification(self):
        return self._VerifCompat(
            self.verification_interval,
            self.use_storm,
            self.prism_output,
        )


# ----------------------------------------------------------------------
# Loader
# ----------------------------------------------------------------------

def _build_property_definitions(
    properties_map: Dict[str, str],
    thresholds: SafetyThresholds,
) -> List[PropertyDefinition]:
    """Convert the flat properties dict into PropertyDefinition objects
    and attach threshold / direction from the safety_thresholds block."""
    defs: List[PropertyDefinition] = []

    for key, pctl in properties_map.items():
        prop = PropertyDefinition(name=key, pctl=pctl)

        # Attach threshold based on key name conventions
        if key == "max_prob_success":
            prop.threshold = thresholds.min_prob_success
            prop.direction = "above"
        elif key == "min_expected_cycles":
            prop.threshold = thresholds.max_expected_cycles
            prop.direction = "below"
        elif key == "prob_missing_critical_action":
            prop.threshold = thresholds.max_prob_missing_critical
            prop.direction = "below"

        defs.append(prop)

    return defs


def load_config(path: str | Path) -> AgentGuardConfig:
    """Parse *path* and return a validated :class:`AgentGuardConfig`."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Config file not found: {path}")

    with open(path, "r", encoding="utf-8") as fh:
        raw: Dict[str, Any] = yaml.safe_load(fh)

    # ── agent block ───────────────────────────────────────────────────
    agent_block = raw.get("agent", {})
    agent_name: str = agent_block.get("name", "Agent")
    verification_interval: int = int(
        agent_block.get("verification_interval", 10)
    )

    # ── states / actions ──────────────────────────────────────────────
    states: List[str] = raw.get("states", [])
    actions: List[str] = raw.get("actions", [])

    # ── safety thresholds ─────────────────────────────────────────────
    t_raw = raw.get("safety_thresholds", {})
    thresholds = SafetyThresholds(
        min_prob_success=float(t_raw.get("min_prob_success", 0.8)),
        max_expected_cycles=float(t_raw.get("max_expected_cycles", 50.0)),
        max_prob_missing_critical=float(
            t_raw.get("max_prob_missing_critical", 0.1)
        ),
    )

    # ── properties ────────────────────────────────────────────────────
    props_raw: Dict[str, str] = raw.get("properties", {})
    properties = _build_property_definitions(props_raw, thresholds)

    return AgentGuardConfig(
        agent_name=agent_name,
        verification_interval=verification_interval,
        states=states,
        actions=actions,
        properties=properties,
        thresholds=thresholds,
    )
