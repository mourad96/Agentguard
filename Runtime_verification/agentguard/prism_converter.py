"""
PRISM Converter — translates the learned MDP into a PRISM-language model.

The generated PRISM file can be fed to Storm (via stormpy) or inspected
manually. The converter handles:
  • State name → integer mapping
  • Guarded commands with probabilistic branches
  • Labels for goal / error states
  • Reward structures
  • Deadlock mitigation (self-loops for absorbing states)
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

from agentguard.mdp import MDPModel
from agentguard.config_loader import AgentGuardConfig

logger = logging.getLogger("agentguard.prism")


class PRISMConverter:
    """Convert an :class:`MDPModel` into a PRISM-language MDP string."""

    def __init__(self, config: AgentGuardConfig) -> None:
        self.config = config

    # ── Public API ────────────────────────────────────────────────────

    def convert(
        self,
        mdp: MDPModel,
        output_path: Optional[str | Path] = None,
    ) -> str:
        """
        Build the full PRISM model string from the current MDP.

        If *output_path* is given the model is also written to disk.
        """
        state_map = self._build_state_map(mdp)
        transitions = mdp.get_all_transition_data()

        sections: list[str] = [
            self._header(),
            self._module(mdp, state_map, transitions),
            self._labels(mdp, state_map),
            self._rewards(mdp, state_map, transitions),
        ]
        prism_model = "\n".join(sections)

        if output_path:
            p = Path(output_path)
            p.write_text(prism_model, encoding="utf-8")
            logger.info("PRISM model written to %s", p.resolve())

        return prism_model

    # ── Internals ─────────────────────────────────────────────────────

    def _build_state_map(self, mdp: MDPModel) -> Dict[str, int]:
        """Map state names to integer IDs, initial state always → 0."""
        ordered: list[str] = [mdp.initial_state]
        for s in mdp.states:
            if s != mdp.initial_state:
                ordered.append(s)
        return {name: idx for idx, name in enumerate(ordered)}

    def _header(self) -> str:
        return "// AgentGuard — auto-generated PRISM model\nmdp\n"

    def _module(
        self,
        mdp: MDPModel,
        state_map: Dict[str, int],
        transitions: Dict[Tuple[str, str], Dict[str, float]],
    ) -> str:
        n = len(state_map)
        lines = [
            f"module agent",
            f"  s : [0..{n - 1}] init {state_map[mdp.initial_state]};",
            "",
        ]

        # Collect states that already have outgoing transitions
        states_with_actions: Set[str] = {s for (s, _) in transitions}

        for (from_state, action), dist in sorted(
            transitions.items(), key=lambda x: (state_map.get(x[0][0], 0), x[0][1])
        ):
            sid = state_map[from_state]
            branches = " + ".join(
                f"{prob:.6f} : (s'={state_map[to_state]})"
                for to_state, prob in sorted(dist.items(), key=lambda x: state_map[x[0]])
            )
            safe_action = self._safe_action_name(action)
            lines.append(f"  [{safe_action}] s={sid} -> {branches};")

        # Deadlock mitigation: add self-loops for absorbing states
        for state_name, sid in sorted(state_map.items(), key=lambda x: x[1]):
            if state_name not in states_with_actions:
                lines.append(f"  [_stay] s={sid} -> 1.000000 : (s'={sid});")

        lines.append("")
        lines.append("endmodule")
        return "\n".join(lines)

    def _labels(self, mdp: MDPModel, state_map: Dict[str, int]) -> str:
        lines = ["\n// --- Labels ---"]

        # Goal label
        goal_ids = [
            str(state_map[s])
            for s in self.config.goal_states
            if s in state_map
        ]
        if goal_ids:
            expr = " | ".join(f"s={gid}" for gid in goal_ids)
            lines.append(f'label "goal" = {expr};')

        # Error label
        error_ids = [
            str(state_map[s])
            for s in self.config.error_states
            if s in state_map
        ]
        if error_ids:
            expr = " | ".join(f"s={eid}" for eid in error_ids)
            lines.append(f'label "error" = {expr};')

        # Action-based labels (every action that leads to a state)
        action_targets: Dict[str, Set[int]] = {}
        for (_, action), dist in mdp.get_all_transition_data().items():
            safe = self._safe_action_name(action)
            if safe not in action_targets:
                action_targets[safe] = set()
            for to_state in dist:
                action_targets[safe].add(state_map[to_state])

        for action_name, target_ids in sorted(action_targets.items()):
            expr = " | ".join(f"s={tid}" for tid in sorted(target_ids))
            lines.append(f'label "did_{action_name}" = {expr};')

        return "\n".join(lines)

    def _rewards(
        self,
        mdp: MDPModel,
        state_map: Dict[str, int],
        transitions: Dict[Tuple[str, str], Dict[str, float]],
    ) -> str:
        if not self.config.rewards:
            return ""

        sections: list[str] = []
        for reward in self.config.rewards:
            lines = [f'\nrewards "{reward.name}"']
            if reward.type == "transition":
                for (from_state, action) in sorted(
                    transitions.keys(),
                    key=lambda x: (state_map.get(x[0], 0), x[1]),
                ):
                    sid = state_map[from_state]
                    safe_action = self._safe_action_name(action)
                    lines.append(
                        f"  [{safe_action}] s={sid} : {reward.value};"
                    )
            elif reward.type == "state":
                for state_name, sid in sorted(state_map.items(), key=lambda x: x[1]):
                    lines.append(f"  s={sid} : {reward.value};")
            lines.append("endrewards")
            sections.append("\n".join(lines))

        return "\n".join(sections)

    @staticmethod
    def _safe_action_name(action: str) -> str:
        """Sanitise an action name for use as a PRISM action label."""
        return action.replace(" ", "_").replace("-", "_")
