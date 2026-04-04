"""
GuardedHederaToolkit -- Instrumented Hedera tools for AgentGuard.

Wraps every LangChain tool produced by HederaLangchainToolkit so that
each invocation automatically logs state transitions into AgentGuard's
runtime-verification pipeline.

Uses the same 5-state / 4-action MDP as the demo:

    States : Opportunity_Spotted, TX_Construction, TX_Confirmed,
             On_Chain_Revert, Network_Error
    Actions: fetch_data, submit_tx, finalize, adjust_params

Transition map:
    Query tool  : Opportunity_Spotted --fetch_data--> TX_Construction
    Write (ok)  : TX_Construction --submit_tx--> TX_Confirmed
                  TX_Confirmed   --finalize-->   Opportunity_Spotted
    Write (fail): TX_Construction --submit_tx--> On_Chain_Revert
                  On_Chain_Revert --adjust_params--> TX_Construction

Usage:
    guarded = GuardedHederaToolkit(hedera_toolkit, guard_logger)
    tools   = guarded.get_tools()
"""

from __future__ import annotations

import logging
import threading
from functools import wraps
from typing import Any, List, Optional

from langchain_core.tools import BaseTool

logger = logging.getLogger("agentguard.guarded_toolkit")

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

    def _wrap(self, tool: BaseTool) -> BaseTool:
        toolkit = self
        original_run = tool._run
        original_arun = getattr(tool, "_arun", None)
        tool_name = tool.name
        is_query = _is_query_tool(tool_name)

        def _pre(tk: "GuardedHederaToolkit") -> None:
            if is_query:
                tk.log("Opportunity_Spotted", "fetch_data", "TX_Construction")
            # Write tools: no pre-transition needed; they start from
            # TX_Construction (which queries already moved us to).

        def _post_ok(tk: "GuardedHederaToolkit") -> None:
            if is_query:
                return
            tk.log("TX_Construction", "submit_tx", "TX_Confirmed")
            tk.log("TX_Confirmed", "finalize", "Opportunity_Spotted")

        def _post_err(tk: "GuardedHederaToolkit") -> None:
            tk.log("TX_Construction", "submit_tx", "On_Chain_Revert")
            tk.log("On_Chain_Revert", "adjust_params", "TX_Construction")

        @wraps(original_run)
        def guarded_run(*args: Any, **kwargs: Any) -> Any:
            if toolkit.halted:
                return "[HALTED] AgentGuard has stopped this agent."
            _pre(toolkit)
            try:
                result = original_run(*args, **kwargs)
            except Exception:
                _post_err(toolkit)
                raise
            _post_ok(toolkit)
            return result

        tool._run = guarded_run

        if original_arun is not None:
            @wraps(original_arun)
            async def guarded_arun(*args: Any, **kwargs: Any) -> Any:
                if toolkit.halted:
                    return "[HALTED] AgentGuard has stopped this agent."
                _pre(toolkit)
                try:
                    result = await original_arun(*args, **kwargs)
                except Exception:
                    _post_err(toolkit)
                    raise
                _post_ok(toolkit)
                return result

            tool._arun = guarded_arun

        return tool
