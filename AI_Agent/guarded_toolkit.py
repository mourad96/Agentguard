"""
GuardedHederaToolkit -- Instrumented Hedera tools for AgentGuard.

Wraps every LangChain tool produced by HederaLangchainToolkit so that
each invocation automatically logs state transitions into AgentGuard's
runtime-verification pipeline.

Uses the same 5-state / 3-action MDP as the demo:

    States : Opportunity_Spotted, TX_Construction, TX_Confirmed,
             On_Chain_Revert, Network_Error
    Actions: fetch_data, submit_tx, finalize

Transition map (matches demo.py AgentGuardSim.TRANSITIONS):
    Opportunity_Spotted --fetch_data--> TX_Construction     (always)
    TX_Construction     --submit_tx-->  TX_Confirmed        (success)
                        --submit_tx-->  On_Chain_Revert     (revert)
                        --submit_tx-->  Network_Error       (network)
    TX_Confirmed        --finalize-->   Opportunity_Spotted (always)
    On_Chain_Revert     --fetch_data--> TX_Construction     (retry)
    Network_Error       --fetch_data--> Opportunity_Spotted (recover)
"""

from __future__ import annotations

import logging
import threading
from functools import wraps
from typing import Any, List, Optional

from langchain_core.tools import BaseTool

logger = logging.getLogger("agentguard.guarded_toolkit")

NETWORK_ERRORS = (ConnectionError, TimeoutError, OSError)


def _is_query_tool(name: str) -> bool:
    """Return True for read-only tools (balance queries, account info, etc.)."""
    return "query" in name.lower()


class GuardedHederaToolkit:
    """Wraps a HederaLangchainToolkit to feed AgentGuard with transitions."""

    def __init__(
        self,
        hedera_toolkit: Any,
        guard: Any,
        halt_flag: Optional[threading.Event] = None,
        default_state: str = "Opportunity_Spotted",
    ) -> None:
        self._toolkit = hedera_toolkit
        self._guard = guard
        self._halt = halt_flag or threading.Event()
        self._state = default_state
        self._default = default_state
        self._lock = threading.Lock()

    @property
    def halted(self) -> bool:
        return self._halt.is_set()

    def halt(self) -> None:
        self._halt.set()

    def get_tools(self) -> List[BaseTool]:
        """Return wrapped copies of every Hedera tool."""
        raw_tools = self._toolkit.get_tools()
        return [self._wrap(t) for t in raw_tools]

    def log(self, from_state: str, action: str, to_state: str) -> None:
        """Convenience: log a transition and update internal state."""
        with self._lock:
            self._guard.log_transition(from_state, action, to_state)
            self._state = to_state

    @property
    def state(self) -> str:
        with self._lock:
            return self._state

    def _inject_error_paths(self) -> None:
        """Feed the MDP with all possible error branches and their recovery
        edges so the model graph is never structurally incomplete.

        Recovery edges are queued first so that if a verification check fires
        mid-batch, error states already have outgoing transitions and are
        never treated as absorbing.

        Uses ``_guard.log_transition`` directly (bypasses the state tracker)
        so the toolkit's internal ``_state`` is unaffected.
        """
        g = self._guard.log_transition
        g("On_Chain_Revert", "fetch_data", "TX_Construction")
        g("Network_Error", "fetch_data", "Opportunity_Spotted")
        g("TX_Construction", "submit_tx", "On_Chain_Revert")
        g("TX_Construction", "submit_tx", "Network_Error")

    def _navigate_to_tx_construction(self) -> None:
        """Log recovery / navigation transitions to reach TX_Construction."""
        if self.state == "TX_Construction":
            return
        if self.state == "Network_Error":
            self.log("Network_Error", "fetch_data", "Opportunity_Spotted")
        if self.state == "TX_Confirmed":
            self.log("TX_Confirmed", "finalize", "Opportunity_Spotted")
        if self.state == "On_Chain_Revert":
            self.log("On_Chain_Revert", "fetch_data", "TX_Construction")
            return
        if self.state == "Opportunity_Spotted":
            self.log("Opportunity_Spotted", "fetch_data", "TX_Construction")

    def _wrap(self, tool: BaseTool) -> BaseTool:
        toolkit = self
        original_run = tool._run
        original_arun = getattr(tool, "_arun", None)
        is_query = _is_query_tool(tool.name)

        @wraps(original_run)
        def guarded_run(*args: Any, **kwargs: Any) -> Any:
            if toolkit.halted:
                return "[HALTED] AgentGuard has stopped this agent."
            if not is_query:
                toolkit._navigate_to_tx_construction()
            try:
                result = original_run(*args, **kwargs)
            except Exception as exc:
                if is_query:
                    raise
                if isinstance(exc, NETWORK_ERRORS):
                    toolkit.log("TX_Construction", "submit_tx", "Network_Error")
                else:
                    toolkit.log("TX_Construction", "submit_tx", "On_Chain_Revert")
                toolkit._inject_error_paths()
                raise
            if is_query:
                toolkit._navigate_to_tx_construction()
            else:
                toolkit.log("TX_Construction", "submit_tx", "TX_Confirmed")
                toolkit.log("TX_Confirmed", "finalize", "Opportunity_Spotted")
                toolkit._inject_error_paths()
            return result

        tool._run = guarded_run

        if original_arun is not None:
            @wraps(original_arun)
            async def guarded_arun(*args: Any, **kwargs: Any) -> Any:
                if toolkit.halted:
                    return "[HALTED] AgentGuard has stopped this agent."
                if not is_query:
                    toolkit._navigate_to_tx_construction()
                try:
                    result = await original_arun(*args, **kwargs)
                except Exception as exc:
                    if is_query:
                        raise
                    if isinstance(exc, NETWORK_ERRORS):
                        toolkit.log("TX_Construction", "submit_tx", "Network_Error")
                    else:
                        toolkit.log("TX_Construction", "submit_tx", "On_Chain_Revert")
                    toolkit._inject_error_paths()
                    raise
                if is_query:
                    toolkit._navigate_to_tx_construction()
                else:
                    toolkit.log("TX_Construction", "submit_tx", "TX_Confirmed")
                    toolkit.log("TX_Confirmed", "finalize", "Opportunity_Spotted")
                    toolkit._inject_error_paths()
                return result

            tool._arun = guarded_arun

        return tool
