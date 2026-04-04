"""
Online Model Learner — dynamically builds an MDP from observed transitions.

The MDPModel maintains raw transition *counts* and lazily derives
probabilities so that probabilistic model checking always reflects the
agent's most-recent empirical behavior.
"""

from __future__ import annotations

import logging
import os
import re
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Dict, List, Set, Tuple

logger = logging.getLogger("agentguard.mdp")


@dataclass
class TransitionEvent:
    """A single observed transition dropped into the queue by the logger."""
    from_state: str
    action: str
    to_state: str
    metadata: dict | None = None


class MDPModel:
    """
    An incrementally-learned Markov Decision Process.

    Internal representation
    ─────────────────────
    _counts[(s, a)][s']  = number of times (s) --a--> (s') was observed.
    """

    def __init__(self, initial_state: str = "idle") -> None:
        self.initial_state: str = initial_state
        self._states: Set[str] = {initial_state}
        self._actions: Set[str] = set()

        # (from_state, action) → { to_state: count }
        self._counts: Dict[Tuple[str, str], Dict[str, int]] = defaultdict(
            lambda: defaultdict(int)
        )
        self._total_transitions: int = 0

    def seed_states(self, state_names: list[str]) -> None:
        """Pre-register states from config so they appear in all models,
        even before being observed in transitions."""
        for name in state_names:
            self._states.add(name)

    def load_from_prism(self, prism_path: str, seed_weight: int = 100) -> None:
        """Parse an existing PRISM file to seed the MDP with previous probabilities.

        ``seed_weight`` controls how many virtual counts each probability unit
        contributes (e.g. prob=0.50 with seed_weight=100 → 50 counts; with
        seed_weight=5 → 2 counts).  A lower value makes the seed lighter so
        that subsequent live transitions shift the model more quickly.
        """
        if not os.path.exists(prism_path):
            return

        with open(prism_path, "r", encoding="utf-8") as f:
            content = f.read()

        # Parse labels to get state id -> state name
        # Example: label "Network_Error" = s=0;
        id_to_name = {}
        for match in re.finditer(r'label "([^"]+)" = s=(\d+);', content):
            name, sid = match.groups()
            sid = int(sid)
            # State labels are defined first. Don't overwrite state names
            # with single-state action labels that appear later in the file.
            if sid not in id_to_name:
                id_to_name[sid] = name

        # Parse transitions [action] s=from -> prob:(s'=to) + ...
        # Example: [submit_tx] s=3 -> 0.1250:(s'=0) + 0.7500:(s'=1) + 0.1250:(s'=2);
        for match in re.finditer(r'\[([^\]]+)\] s=(\d+) -> (.*?);', content):
            action = match.group(1)
            if action == "wait":
                continue
            from_id = int(match.group(2))
            from_state = id_to_name.get(from_id, f"unknown_{from_id}")

            branches = match.group(3)
            for b_match in re.finditer(r'([\d\.]+):\(s\'=(\d+)\)', branches):
                prob = float(b_match.group(1))
                to_id = int(b_match.group(2))
                to_state = id_to_name.get(to_id, f"unknown_{to_id}")

                # Convert probability to virtual counts using seed_weight.
                # At least 1 count so every observed branch is represented.
                count = max(1, int(prob * seed_weight))
                self._counts[(from_state, action)][to_state] += count
                self._total_transitions += count
                self._states.add(from_state)
                self._states.add(to_state)
                self._actions.add(action)

        logger.info(
            "Seeded MDP from %s (%d past transition weights loaded, seed_weight=%d)",
            prism_path, self._total_transitions, seed_weight,
        )

    # ── Mutation ──────────────────────────────────────────────────────

    def add_transition(
        self, from_state: str, action: str, to_state: str
    ) -> None:
        """Record a single observed transition."""
        self._states.add(from_state)
        self._states.add(to_state)
        self._actions.add(action)
        self._counts[(from_state, action)][to_state] += 1
        self._total_transitions += 1
        logger.debug(
            "Transition #%d: %s --%s--> %s",
            self._total_transitions, from_state, action, to_state,
        )

    # ── Queries ───────────────────────────────────────────────────────

    @property
    def states(self) -> List[str]:
        return sorted(self._states)

    @property
    def actions(self) -> List[str]:
        return sorted(self._actions)

    @property
    def total_transitions(self) -> int:
        return self._total_transitions

    def get_enabled_actions(self, state: str) -> List[str]:
        """Return actions that have been observed from *state*."""
        return sorted(
            {a for (s, a) in self._counts if s == state}
        )

    def get_transition_probabilities(
        self, state: str, action: str
    ) -> Dict[str, float]:
        """
        Return {next_state: probability} for a given (state, action) pair.
        Probabilities are derived from empirical frequencies.
        """
        dist = self._counts.get((state, action))
        if not dist:
            return {}
        total = sum(dist.values())
        return {s: c / total for s, c in dist.items()}

    def get_all_transition_data(
        self,
    ) -> Dict[Tuple[str, str], Dict[str, float]]:
        """Return the full probability table for every (state, action)."""
        result: Dict[Tuple[str, str], Dict[str, float]] = {}
        for (s, a) in self._counts:
            result[(s, a)] = self.get_transition_probabilities(s, a)
        return result

    # ── Diagnostics ───────────────────────────────────────────────────

    def summary(self) -> str:
        lines = [
            f"MDP Summary  ({len(self._states)} states, "
            f"{len(self._actions)} actions, "
            f"{self._total_transitions} transitions observed)",
            f"  Initial state : {self.initial_state}",
            f"  States        : {', '.join(self.states)}",
            f"  Actions       : {', '.join(self.actions)}",
        ]
        for (s, a), dist in sorted(self._counts.items()):
            total = sum(dist.values())
            probs = ", ".join(
                f"{ns}: {c/total:.2f}" for ns, c in sorted(dist.items())
            )
            lines.append(f"  ({s}, {a}) → [{probs}]")
        return "\n".join(lines)
