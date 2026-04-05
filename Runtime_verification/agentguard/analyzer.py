"""
AnalyzerThread — the background verification engine.

Runs as a daemon thread, continuously consuming transition events from
the shared queue and periodically triggering formal verification.
"""

from __future__ import annotations

import logging
import os
import queue
import threading
from pathlib import Path
from typing import Callable, List, Optional

from agentguard.config_loader import AgentGuardConfig
from agentguard.mdp import MDPModel, TransitionEvent
from agentguard.prism_converter import PRISMConverter
from agentguard.model_checker import CheckResult, create_checker
from agentguard.actuator import Actuator, ThresholdResult

logger = logging.getLogger("agentguard.analyzer")


class AnalyzerThread(threading.Thread):
    """
    Background thread that:
      1. Drains transition events from the queue.
      2. Updates the in-memory MDP.
      3. Every *check_interval* transitions, converts MDP → PRISM and
         runs the probabilistic model checker.
      4. Forwards results to the :class:`Actuator`.
    """

    def __init__(
        self,
        event_queue: queue.Queue[TransitionEvent],
        config: AgentGuardConfig,
        on_alert: Optional[Callable[[ThresholdResult], None]] = None,
        on_intervene: Optional[Callable[[ThresholdResult], None]] = None,
    ) -> None:
        super().__init__(daemon=True, name="AgentGuard-Analyzer")
        self._queue = event_queue
        self._config = config

        # Core components
        self._mdp = MDPModel(initial_state=config.initial_state)
        # Pre-register all config states so labels are always present in
        # the generated PRISM model, even before those states are visited.
        self._mdp.seed_states(config.states)
        self._prism_output = config.verification.prism_output
        if config.seed_from_previous:
            self._mdp.load_from_prism(self._prism_output, seed_weight=config.seed_weight)
        else:
            logger.info("seed_from_previous=false -- starting with a clean MDP")
        self._converter = PRISMConverter(config)
        self._checker = create_checker(use_storm=config.verification.use_storm)
        self._actuator = Actuator(
            property_defs=config.properties,
            on_alert=on_alert,
            on_intervene=on_intervene,
        )

        # Bookkeeping
        self._check_interval = config.verification.check_interval
        # prism_output is already on self._prism_output
        self._transitions_since_check = 0
        self._stop_event = threading.Event()
        self._latest_results: List[CheckResult] = []
        self._latest_evaluated: List[ThresholdResult] = []

    # ── Thread lifecycle ──────────────────────────────────────────────

    def run(self) -> None:
        logger.info("AnalyzerThread started (interval=%d)", self._check_interval)
        while not self._stop_event.is_set():
            try:
                event = self._queue.get(timeout=0.25)
            except queue.Empty:
                continue

            self._process_event(event)
            self._queue.task_done()

        # Drain remaining events on shutdown
        self._flush()
        logger.info("AnalyzerThread stopped")

    def request_stop(self) -> None:
        """Signal the thread to finish and stop."""
        self._stop_event.set()

    # ── Event processing ──────────────────────────────────────────────

    def _process_event(self, event: TransitionEvent) -> None:
        self._mdp.add_transition(event.from_state, event.action, event.to_state)
        self._transitions_since_check += 1

        if self._transitions_since_check >= self._check_interval:
            self._run_verification()
            self._transitions_since_check = 0

    def _flush(self) -> None:
        """Drain any remaining events and run a final verification."""
        while True:
            try:
                event = self._queue.get_nowait()
                self._mdp.add_transition(
                    event.from_state, event.action, event.to_state
                )
                self._queue.task_done()
            except queue.Empty:
                break

        if self._transitions_since_check > 0:
            self._run_verification()

    # ── Verification pipeline ─────────────────────────────────────────

    def _run_verification(self) -> None:
        logger.info(
            "Running verification (total transitions: %d)",
            self._mdp.total_transitions,
        )

        # 1. Log MDP summary
        logger.info("MDP summary:\n%s", self._mdp.summary())

        # 2. Convert MDP → PRISM
        prism_model = self._converter.convert(
            self._mdp, output_path=self._prism_output
        )

        # 3. Run model checker
        prop_dicts = [
            {"name": p.name, "pctl": p.pctl}
            for p in self._config.properties
        ]
        self._latest_results = self._checker.check(prism_model, prop_dicts)

        # 4. Send results to actuator (dashboard + callbacks)
        self._latest_evaluated = self._actuator.process(self._latest_results)

        # 5. Write dashboard report to disk
        self._write_report()

    def _write_report(self) -> None:
        """Write the latest dashboard values to a text file next to the PRISM model."""
        if not self._latest_evaluated:
            return
        report_path = Path(self._prism_output).with_name("dashboard_report.txt")
        icons = {"ok": "[OK]", "warning": "[!]", "critical": "[X]"}
        lines = [
            "=" * 78,
            "  AgentGuard -- Assurance Dashboard",
            "=" * 78,
            f"  {'Property':<28} {'Value':>10} {'Threshold':>12} {'Dir':>6} {'Status':>8}",
            "  " + "-" * 70,
        ]
        for tr in self._latest_evaluated:
            icon = icons.get(tr.severity, "[?]")
            thresh_str = f"{tr.threshold}" if tr.threshold is not None else "  N/A"
            dir_str = tr.direction if tr.threshold is not None else "  N/A"
            lines.append(
                f"  {tr.check.property_name:<28} "
                f"{tr.check.value:>10.4f} "
                f"{thresh_str:>12} {dir_str:>6}  {icon}"
            )
        lines.append("-" * 78)
        report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    # ── Accessors ─────────────────────────────────────────────────────

    @property
    def mdp(self) -> MDPModel:
        return self._mdp

    @property
    def latest_results(self) -> List[CheckResult]:
        return list(self._latest_results)

    @property
    def latest_evaluated(self) -> List[ThresholdResult]:
        return list(self._latest_evaluated)
