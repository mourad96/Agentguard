"""
Configuration loader for AgentGuard.

Reads and validates the YAML configuration file that defines the agent's
semantic states, actions, PCTL properties, and verification settings.
"""

from __future__ import annotations

import yaml
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, List, Optional


# ──────────────────────────────────────────────────────────────────────
# Data classes
# ──────────────────────────────────────────────────────────────────────

@dataclass
class StateDefinition:
    """A semantic state the agent can occupy."""
    name: str
    is_initial: bool = False
    is_goal: bool = False
    is_error: bool = False


@dataclass
class PropertyDefinition:
    """A PCTL property to verify, with an optional threshold."""
    name: str
    pctl: str
    threshold: Optional[float] = None
    direction: str = "above"          # "above" or "below"


@dataclass
class RewardDefinition:
    """A reward (cost) structure attached to the MDP."""
    name: str
    type: str = "transition"          # "transition" or "state"
    value: float = 1.0


@dataclass
class VerificationSettings:
    """Knobs for the background verification engine."""
    check_interval: int = 5           # verify every N transitions
    use_storm: bool = False           # False → mock mode
    prism_output: str = "latest_model.prism"


@dataclass
class AgentGuardConfig:
    """Top-level configuration object."""
    states: List[StateDefinition] = field(default_factory=list)
    actions: List[str] = field(default_factory=list)
    properties: List[PropertyDefinition] = field(default_factory=list)
    rewards: List[RewardDefinition] = field(default_factory=list)
    verification: VerificationSettings = field(
        default_factory=VerificationSettings
    )

    # ── Convenience helpers ───────────────────────────────────────────

    @property
    def initial_state(self) -> str:
        """Return the name of the initial state (first one marked)."""
        for s in self.states:
            if s.is_initial:
                return s.name
        return self.states[0].name if self.states else "unknown"

    @property
    def goal_states(self) -> List[str]:
        return [s.name for s in self.states if s.is_goal]

    @property
    def error_states(self) -> List[str]:
        return [s.name for s in self.states if s.is_error]

    @property
    def state_names(self) -> List[str]:
        return [s.name for s in self.states]


# ──────────────────────────────────────────────────────────────────────
# Loader
# ──────────────────────────────────────────────────────────────────────

def load_config(path: str | Path) -> AgentGuardConfig:
    """Parse *path* and return a validated :class:`AgentGuardConfig`."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Config file not found: {path}")

    with open(path, "r", encoding="utf-8") as fh:
        raw: dict[str, Any] = yaml.safe_load(fh)

    root: dict[str, Any] = raw.get("agentguard", raw)

    # --- States ---
    states = [
        StateDefinition(
            name=s["name"],
            is_initial=s.get("is_initial", False),
            is_goal=s.get("is_goal", False),
            is_error=s.get("is_error", False),
        )
        for s in root.get("states", [])
    ]

    # --- Actions ---
    actions: list[str] = root.get("actions", [])

    # --- Properties ---
    properties = [
        PropertyDefinition(
            name=p["name"],
            pctl=p["pctl"],
            threshold=p.get("threshold"),
            direction=p.get("direction", "above"),
        )
        for p in root.get("properties", [])
    ]

    # --- Rewards ---
    rewards = [
        RewardDefinition(
            name=r["name"],
            type=r.get("type", "transition"),
            value=r.get("value", 1.0),
        )
        for r in root.get("rewards", [])
    ]

    # --- Verification settings ---
    v_raw = root.get("verification", {})
    verification = VerificationSettings(
        check_interval=v_raw.get("check_interval", 5),
        use_storm=v_raw.get("use_storm", False),
        prism_output=v_raw.get("prism_output", "latest_model.prism"),
    )

    return AgentGuardConfig(
        states=states,
        actions=actions,
        properties=properties,
        rewards=rewards,
        verification=verification,
    )
