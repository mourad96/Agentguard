"""
PRISM Converter -- translates the learned MDP into a PRISM-language model.

Output format matches the target specification:
  * No auto-generated comment header -- just "mdp"
  * State map: initial state gets the HIGHEST integer index
  * Transition probabilities formatted to 4 decimal places (e.g. 1.0000)
  * Labels for every state name AND every action name
    - State labels: label "<Name>" = s=<id>;
    - Action labels: label "<action>" = s=<src1> | s=<src2> | ...;
      (action label = all SOURCE states where that action is enabled)
  * Deadlock self-loop uses [wait] with probability 1.0
  * Reward structure named after config.reward_name (default "cycles")
    with value 1.00 per transition
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
            self._labels(mdp, state_map, transitions),
            self._rewards(mdp, state_map, transitions),
        ]
        # Join with a single newline; each section already ends properly
        prism_model = "\n".join(sections)

        if output_path:
            p = Path(output_path)
            p.write_text(prism_model, encoding="utf-8")
            logger.info("PRISM model written to %s", p.resolve())

        return prism_model

    # ── Internals ─────────────────────────────────────────────────────

    def _build_state_map(self, mdp: MDPModel) -> Dict[str, int]:
        """
        Map state names to integer IDs.

        Assignment order (matches target model):
          - All non-initial states get IDs 0, 1, 2, ... in sorted order.
          - The initial state gets the highest ID (len(states) - 1).
        """
        all_states = sorted(mdp.states)
        initial = mdp.initial_state
        non_initial = [s for s in all_states if s != initial]

        # non-initial states are numbered 0 .. N-2 in sorted order
        state_map: Dict[str, int] = {}
        for idx, name in enumerate(non_initial):
            state_map[name] = idx
        # initial state gets the last (highest) ID
        state_map[initial] = len(all_states) - 1
        return state_map

    def _header(self) -> str:
        return "mdp\n"

    def _module(
        self,
        mdp: MDPModel,
        state_map: Dict[str, int],
        transitions: Dict[Tuple[str, str], Dict[str, float]],
    ) -> str:
        n = len(state_map)
        init_id = state_map[mdp.initial_state]
        lines = [
            "module agent",
            f"    s : [0..{n - 1}] init {init_id};",
            "",
        ]

        # Sort by (from_state_id, action) for deterministic output
        for (from_state, action), dist in sorted(
            transitions.items(),
            key=lambda x: (state_map.get(x[0][0], 0), x[0][1]),
        ):
            sid = state_map[from_state]
            branches = " + ".join(
                f"{prob:.4f}:(s'={state_map[to_state]})"
                for to_state, prob in sorted(
                    dist.items(), key=lambda x: state_map[x[0]]
                )
            )
            safe_action = self._safe_action_name(action)
            lines.append(f"    [{safe_action}] s={sid} -> {branches};")

        # Deadlock mitigation: [wait] self-loop for absorbing states
        states_with_actions: Set[str] = {s for (s, _) in transitions}
        for state_name, sid in sorted(state_map.items(), key=lambda x: x[1]):
            if state_name not in states_with_actions:
                lines.append(f"    [wait] s={sid} -> 1.0:(s'={sid});")

        lines.append("endmodule")
        return "\n".join(lines)

    def _labels(
        self,
        mdp: MDPModel,
        state_map: Dict[str, int],
        transitions: Dict[Tuple[str, str], Dict[str, float]],
    ) -> str:
        """
        Emit two kinds of labels (both sorted alphabetically):

        1. State labels  -- label "<StateName>" = s=<id>;
        2. Action labels -- label "<action>" = s=<src1> | s=<src2> | ...;
           The RHS is the set of SOURCE states where that action is enabled.
        """
        lines: list[str] = [""]

        # 1. State name labels (sorted by state name)
        for state_name, sid in sorted(state_map.items(), key=lambda x: x[0]):
            lines.append(f'label "{state_name}" = s={sid};')

        # 2. Action source-state labels
        # Collect source states per action
        action_sources: Dict[str, Set[int]] = {}
        for (from_state, action) in transitions:
            safe = self._safe_action_name(action)
            if safe not in action_sources:
                action_sources[safe] = set()
            action_sources[safe].add(state_map[from_state])

        for action_name, src_ids in sorted(action_sources.items()):
            expr = " | ".join(f"s={sid}" for sid in sorted(src_ids))
            lines.append(f'label "{action_name}" = {expr};')

        return "\n".join(lines)

    def _rewards(
        self,
        mdp: MDPModel,
        state_map: Dict[str, int],
        transitions: Dict[Tuple[str, str], Dict[str, float]],
    ) -> str:
        """
        Emit a rewards block named after config.reward_name.

        Every transition (including the [wait] self-loop) costs 1.00.
        """
        reward_name = getattr(self.config, "reward_name", "cycles")
        lines = [f'\nrewards "{reward_name}"']

        # Real transitions
        for (from_state, action) in sorted(
            transitions.keys(),
            key=lambda x: (state_map.get(x[0], 0), x[1]),
        ):
            sid = state_map[from_state]
            safe_action = self._safe_action_name(action)
            lines.append(f"    [{safe_action}] s={sid} : 1.00;")

        # [wait] self-loops for absorbing states
        states_with_actions: Set[str] = {s for (s, _) in transitions}
        for state_name, sid in sorted(state_map.items(), key=lambda x: x[1]):
            if state_name not in states_with_actions:
                lines.append(f"    [wait] s={sid} : 1.0;")

        lines.append("endrewards")
        return "\n".join(lines)

    @staticmethod
    def _safe_action_name(action: str) -> str:
        """Sanitise an action name for use as a PRISM action label."""
        return action.replace(" ", "_").replace("-", "_")
