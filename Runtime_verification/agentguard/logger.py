"""
AgentGuardLogger — lightweight, developer-facing instrumentation API.

Usage
─────
    from agentguard import AgentGuardLogger

    guard = AgentGuardLogger("config.yaml")
    guard.log_transition("idle", "search", "searching")
    ...
    guard.shutdown()
"""

from __future__ import annotations

import logging
import queue
from typing import Callable, Optional

from agentguard.config_loader import AgentGuardConfig, load_config
from agentguard.mdp import TransitionEvent
from agentguard.analyzer import AnalyzerThread
from agentguard.actuator import ThresholdResult

logger = logging.getLogger("agentguard.logger")


class AgentGuardLogger:
    """
    The single class developers interact with.

    It loads the configuration, spawns the background
    :class:`AnalyzerThread`, and exposes a near-zero-overhead
    ``log_transition`` method that drops events into a queue.
    """

    def __init__(
        self,
        config_path: str,
        on_alert: Optional[Callable[[ThresholdResult], None]] = None,
        on_intervene: Optional[Callable[[ThresholdResult], None]] = None,
    ) -> None:
        self._config: AgentGuardConfig = load_config(config_path)
        self._queue: queue.Queue[TransitionEvent] = queue.Queue()

        self._analyzer = AnalyzerThread(
            event_queue=self._queue,
            config=self._config,
            on_alert=on_alert,
            on_intervene=on_intervene,
        )
        self._analyzer.start()
        logger.info("AgentGuardLogger initialised -- analyzer thread running")

    # ── Public API ────────────────────────────────────────────────────

    def log_transition(
        self,
        from_state: str,
        action: str,
        to_state: str,
        metadata: dict | None = None,
    ) -> None:
        """
        Record a state transition.

        This is designed to be as lightweight as possible — it simply
        enqueues a :class:`TransitionEvent` and returns immediately so
        that the calling agent is never blocked by verification work.
        """
        event = TransitionEvent(
            from_state=from_state,
            action=action,
            to_state=to_state,
            metadata=metadata,
        )
        self._queue.put_nowait(event)
        logger.debug("Queued: %s --%s--> %s", from_state, action, to_state)

    def shutdown(self, timeout: float = 5.0) -> None:
        """
        Signal the analyzer to finish, wait for it to drain the queue,
        and print a final summary.
        """
        logger.info("Shutdown requested -- draining queue ...")
        self._analyzer.request_stop()
        self._analyzer.join(timeout=timeout)
        if self._analyzer.is_alive():
            logger.warning("AnalyzerThread did not stop within %.1fs", timeout)
        else:
            logger.info("AnalyzerThread stopped cleanly")

    # ── Accessors ─────────────────────────────────────────────────────

    @property
    def config(self) -> AgentGuardConfig:
        return self._config

    @property
    def analyzer(self) -> AnalyzerThread:
        return self._analyzer
