#!/usr/bin/env python3
"""
Hedera DeFi Agent -- AgentGuard-Monitored
==========================================
An AI agent that executes real financial operations on Hedera Testnet
(balance queries, HBAR transfers, HTS token creation) while being
monitored by the AgentGuard runtime-verification framework.

Prerequisites
-------------
  pip install -r requirements.txt
  cp .env.example .env   # fill in your credentials

Usage
-----
  python hedera_defi_agent.py
"""

from __future__ import annotations

import asyncio
import io
import logging
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "Runtime_verification"))

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

from dotenv import load_dotenv

from hedera_agent_kit.langchain.toolkit import HederaLangchainToolkit
from hedera_agent_kit.plugins import (
    core_account_plugin,
    core_account_query_plugin,
    core_token_plugin,
)
from hedera_agent_kit.shared.configuration import Configuration, Context, AgentMode
from hiero_sdk_python import Client, Network, AccountId, PrivateKey
from langchain.agents import create_agent
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.checkpoint.memory import MemorySaver

from agentguard import AgentGuardLogger
from agentguard.actuator import ThresholdResult
from guarded_toolkit import GuardedHederaToolkit

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(name)-24s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("hedera_defi_agent")


# ── AgentGuard callbacks ─────────────────────────────────────────────

def on_alert(result: ThresholdResult) -> None:
    print(
        f"\n  [!] ALERT: '{result.check.property_name}' = {result.check.value:.4f} "
        f"(threshold: {result.threshold}, dir: {result.direction})\n"
    )


def on_intervene(result: ThresholdResult) -> None:
    print(
        f"\n  [X] INTERVENTION: '{result.check.property_name}' = {result.check.value:.4f} "
        f"critically breaches threshold {result.threshold}!"
        f"\n      -> In production this would HALT the agent.\n"
    )


# ── Main ─────────────────────────────────────────────────────────────

TASKS = [
    "What is my current HBAR balance?",
    "Transfer 1 HBAR to account {receiver}",
    "Create a fungible token called 'AgentGuardToken' with symbol 'AGT' and an initial supply of 1000",
]


async def main() -> None:
    account_id_str = os.getenv("ACCOUNT_ID")
    private_key_str = os.getenv("PRIVATE_KEY")
    receiver = os.getenv("RECEIVER_ACCOUNT_ID", "0.0.4815862")

    if not account_id_str or not private_key_str:
        sys.exit("ERROR: Set ACCOUNT_ID and PRIVATE_KEY in your .env file.")

    print("=" * 64)
    print("  Hedera DeFi Agent -- AgentGuard Runtime Verification")
    print("=" * 64)
    print(f"\n  Operator  : {account_id_str}")
    print(f"  Receiver  : {receiver}")
    print(f"  Network   : Hedera Testnet")
    print(f"  Tasks     : {len(TASKS)}")
    print()

    # ── Hedera client ────────────────────────────────────────────────
    account_id = AccountId.from_string(account_id_str)
    private_key = PrivateKey.from_string(private_key_str)
    client = Client(Network(network="testnet"))
    client.set_operator(account_id, private_key)

    hedera_toolkit = HederaLangchainToolkit(
        client=client,
        configuration=Configuration(
            tools=[],
            plugins=[
                core_account_plugin,
                core_account_query_plugin,
                core_token_plugin,
            ],
            context=Context(
                mode=AgentMode.AUTONOMOUS,
                account_id=account_id_str,
            ),
        ),
    )

    # ── AgentGuard setup ─────────────────────────────────────────────
    config_path = os.path.join(os.path.dirname(__file__), "config_defi.yaml")
    guard = AgentGuardLogger(
        config_path=config_path,
        on_alert=on_alert,
        on_intervene=on_intervene,
    )

    guarded = GuardedHederaToolkit(hedera_toolkit, guard)
    tools = guarded.get_tools()

    print(f"  Loaded {len(tools)} Hedera tools (instrumented by AgentGuard)")
    print(f"  Tools: {', '.join(t.name for t in tools)}\n")

    # ── LangChain agent ──────────────────────────────────────────────
    gemini_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        google_api_key=gemini_key,
    )

    agent = create_agent(
        model=llm,
        tools=tools,
        checkpointer=MemorySaver(),
        system_prompt=(
            "You are a DeFi agent operating on Hedera Testnet. "
            "You have tools to query balances, transfer HBAR, and create tokens. "
            "Execute each user request using the appropriate tool. "
            "Be concise in your responses."
        ),
    )

    # ── Run tasks ────────────────────────────────────────────────────
    for i, task_template in enumerate(TASKS, 1):
        task = task_template.format(receiver=receiver)
        print(f"\n{'─' * 64}")
        print(f"  Task {i}/{len(TASKS)}: {task}")
        print(f"{'─' * 64}")

        try:
            response = await agent.ainvoke(
                {"messages": [{"role": "user", "content": task}]},
                config={"configurable": {"thread_id": "1"}},
            )
            answer = response["messages"][-1].content
            print(f"\n  Agent: {answer}")
        except Exception as exc:
            log.error("Task %d failed: %s", i, exc)
            print(f"\n  [ERROR] {exc}")

    # ── Shutdown ─────────────────────────────────────────────────────
    print(f"\n{'=' * 64}")
    print("  Shutting down AgentGuard ...")
    guard.shutdown(timeout=10.0)

    prism_path = os.path.join(
        os.path.dirname(__file__),
        "..", "Runtime_verification",
        guard.config.verification.prism_output,
    )
    if os.path.exists(prism_path):
        print(f"\n  [i] Updated PRISM model: {prism_path}")

    print("\n  [v] DeFi Agent demo complete.\n")


if __name__ == "__main__":
    asyncio.run(main())
