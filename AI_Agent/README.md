# AI Agent -- Hedera Testnet with AgentGuard

Real AI agents powered by **LangChain + Hedera Agent Kit** that execute
financial operations on **Hedera Testnet**, monitored in real time by
the **AgentGuard runtime-verification framework**.

## What It Does

| Agent | Script | Operations | Safety |
|-------|--------|------------|--------|
| **DeFi Agent** | `hedera_defi_agent.py` | Balance query, HBAR transfer, HTS token creation | AgentGuard dashboard after each batch |
| **Liquidation Bot** | `hedera_liquidation_agent.py` | Repeated HBAR transfers + token creation in a loop | AgentGuard **halts** the bot on revert-loop detection |

Both agents use the **Hedera Agent Kit** plugin architecture to call
Hedera Testnet APIs via LangChain tool-calling, and every tool
invocation is automatically logged as a state transition into
AgentGuard's MDP model for probabilistic verification.

## Prerequisites

- Python 3.10+
- A Hedera Testnet account ([portal.hedera.com](https://portal.hedera.com/dashboard))
- A Google Gemini API key ([Google AI Studio](https://aistudio.google.com/apikey))

## Setup

```bash
cd AI_Agent

# Create and activate a virtual environment
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure credentials
cp .env.example .env
# Edit .env with your ACCOUNT_ID, PRIVATE_KEY, GEMINI_API_KEY, RECEIVER_ACCOUNT_ID
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ACCOUNT_ID` | Yes | Hedera Testnet operator account (e.g. `0.0.12345`) |
| `PRIVATE_KEY` | Yes | DER-encoded private key from the Hedera portal |
| `GEMINI_API_KEY` | Yes | Google Gemini API key (or set `GOOGLE_API_KEY` instead) |
| `RECEIVER_ACCOUNT_ID` | No | Target account for HBAR transfers (defaults to a testnet faucet) |

## Running

### DeFi Agent

Executes three tasks sequentially: balance query, HBAR transfer, token creation.

```bash
python hedera_defi_agent.py
```

### Liquidation Bot

Runs a multi-round liquidation loop; AgentGuard intervenes if the bot
enters a revert loop.

```bash
python hedera_liquidation_agent.py
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  LangChain Agent  (Gemini)                          │
│    ↓ natural-language tool calls                     │
│  GuardedHederaToolkit                                │
│    ├── logs state transitions → AgentGuardLogger     │
│    └── calls Hedera Agent Kit plugins                │
│         ├── core_account_plugin    (HBAR transfer)   │
│         ├── core_account_query     (balance query)   │
│         └── core_token_plugin      (HTS create/mint) │
│              ↓                                       │
│         Hedera Testnet                               │
└─────────────────────────────────────────────────────┘
         ↕ transitions
┌─────────────────────────────────────────────────────┐
│  AgentGuard  (Runtime_verification/)                 │
│    MDP Model → PRISM Converter → Model Checker      │
│    → Actuator Dashboard → on_alert / on_intervene    │
└─────────────────────────────────────────────────────┘
```

## File Overview

| File | Purpose |
|------|---------|
| `hedera_defi_agent.py` | Main DeFi agent (balance, transfer, create token) |
| `hedera_liquidation_agent.py` | Liquidation bot with retry loop + safety halt |
| `guarded_toolkit.py` | Wraps Hedera tools to log transitions into AgentGuard |
| `config_defi.yaml` | AgentGuard config: states, properties, thresholds for DeFi agent |
| `config_liquidation.yaml` | AgentGuard config: tighter thresholds for liquidation bot |
| `requirements.txt` | Python dependencies |
| `.env.example` | Template for credentials |

## Using a Different LLM Provider

The agents use `ChatGoogleGenerativeAI` from `langchain-google-genai`. To use another provider, replace the import and `llm = ...` block in each agent script (for example `langchain-openai` + `ChatOpenAI`, or `langchain-anthropic` + `ChatAnthropic`) and set the matching API key in `.env`.
