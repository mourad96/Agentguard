"""
AnalyzerThread — the background verification engine.

Runs as a daemon thread, continuously consuming transition events from
the shared queue and periodically triggering formal verification.
"""

from __future__ import annotations

import logging
import queue
import threading
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
        self._converter = PRISMConverter(config)
        self._checker = create_checker(use_storm=config.verification.use_storm)
        self._actuator = Actuator(
            property_defs=config.properties,
            on_alert=on_alert,
            on_intervene=on_intervene,
        )

        # Bookkeeping
        self._check_interval = config.verification.check_interval
        self._prism_output = config.verification.prism_output
        self._transitions_since_check = 0
        self._stop_event = threading.Event()
        self._latest_results: List[CheckResult] = []

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

        # 1. Print MDP summary
        print(f"\n{'─' * 50}")
        print(self._mdp.summary())
        print(f"{'─' * 50}")

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
        self._actuator.process(self._latest_results)

    # ── Accessors ─────────────────────────────────────────────────────

    @property
    def mdp(self) -> MDPModel:
        return self._mdp

    @property
    def latest_results(self) -> List[CheckResult]:
        return list(self._latest_results)
