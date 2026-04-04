"""
GuardedHederaToolkit -- Instrumented Hedera tools for AgentGuard.

Wraps every LangChain tool produced by HederaLangchainToolkit so that
each invocation automatically logs state transitions into AgentGuard's
runtime-verification pipeline.

State machine per tool call:

    current_state  --<tool_name>-->  Executing_<Category>
    Executing_<Category>  --tx_success-->  TX_Confirmed   (on success)
    Executing_<Category>  --tx_error-->    TX_Failed       (on exception)
    TX_Confirmed  --reset-->  Idle
    TX_Failed     --retry-->  Planning

Usage:
    guarded = GuardedHederaToolkit(hedera_toolkit, guard_logger)
    tools   = guarded.get_tools()
"""

from __future__ import annotations

import logging
import threading
from functools import wraps
from typing import Any, Dict, List, Optional

from langchain_core.tools import BaseTool

logger = logging.getLogger("agentguard.guarded_toolkit")

TOOL_STATE_MAP: Dict[str, str] = {
    "transfer_hbar":            "Transferring_HBAR",
    "create_fungible_token":    "Creating_Token",
    "create_nft":               "Creating_Token",
    "mint_token":               "Minting_Token",
    "mint_nft":                 "Minting_Token",
    "transfer_token":           "Transferring_Token",
    "associate_token":          "Transferring_Token",
    "dissociate_token":         "Transferring_Token",
    "airdrop_token":            "Transferring_Token",
    "get_account_balance":      "Querying_Balance",
    "get_account_info":         "Querying_Balance",
    "get_account_token_balance":"Querying_Balance",
}

QUERY_STATES = {"Querying_Balance"}


class GuardedHederaToolkit:
    """Wraps a HederaLangchainToolkit to feed AgentGuard with transitions."""

    def __init__(
        self,
        hedera_toolkit: Any,
        guard: Any,
        halt_flag: Optional[threading.Event] = None,
        default_state: str = "Idle",
        planning_state: str = "Planning",
    ) -> None:
        self._toolkit = hedera_toolkit
        self._guard = guard
        self._halt = halt_flag or threading.Event()
        self._state = default_state
        self._default = default_state
        self._planning = planning_state
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

        def _pre(tk: "GuardedHederaToolkit") -> str:
            mapped = TOOL_STATE_MAP.get(tool_name, f"Executing_{tool_name}")
            prev = tk.state
            if prev in (tk._default, "TX_Confirmed"):
                tk.log(prev, "agent_think", tk._planning)
                prev = tk._planning
            tk.log(prev, tool_name, mapped)
            return mapped

        def _post_ok(tk: "GuardedHederaToolkit", mapped: str) -> None:
            if mapped in QUERY_STATES:
                tk.log(mapped, "query_complete", tk._planning)
            else:
                tk.log(mapped, "tx_success", "TX_Confirmed")
                tk.log("TX_Confirmed", "reset", tk._default)

        def _post_err(tk: "GuardedHederaToolkit", mapped: str) -> None:
            tk.log(mapped, "tx_error", "TX_Failed")
            tk.log("TX_Failed", "retry", tk._planning)

        @wraps(original_run)
        def guarded_run(*args: Any, **kwargs: Any) -> Any:
            if toolkit.halted:
                return "[HALTED] AgentGuard has stopped this agent."
            mapped = _pre(toolkit)
            try:
                result = original_run(*args, **kwargs)
            except Exception:
                _post_err(toolkit, mapped)
                raise
            _post_ok(toolkit, mapped)
            return result

        tool._run = guarded_run

        if original_arun is not None:
            import asyncio

            @wraps(original_arun)
            async def guarded_arun(*args: Any, **kwargs: Any) -> Any:
                if toolkit.halted:
                    return "[HALTED] AgentGuard has stopped this agent."
                mapped = _pre(toolkit)
                try:
                    result = await original_arun(*args, **kwargs)
                except Exception:
                    _post_err(toolkit, mapped)
                    raise
                _post_ok(toolkit, mapped)
                return result

            tool._arun = guarded_arun

        return tool
