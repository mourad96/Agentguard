# AgentGuard — Runtime Verification

Framework-agnostic, non-intrusive middleware that monitors AI agent behaviour and performs formal verification using probabilistic model checking (Storm / PRISM).

## Architecture

```
Agent Code (any framework)
    │
    ▼  log_transition(from, action, to)
AgentGuardLogger ──Queue──▶ AnalyzerThread
                               │
                    ┌──────────┼──────────┐
                    ▼          ▼          ▼
               MDPModel → PRISMConverter → ModelChecker
                                              │
                                              ▼
                                          Actuator
                                    (Dashboard + Callbacks)
```

**AgentGuardLogger** — Lightweight API that drops transition events into a queue (~1 ms overhead).  
**AnalyzerThread** — Background thread that builds an MDP from observations, converts it to PRISM, and runs probabilistic model checking every N transitions.  
**Actuator** — Prints a live assurance dashboard and fires user-defined `on_alert` / `on_intervene` callbacks when safety thresholds are breached.

---

## Quick Start (mock checker, no dependencies)

```bash
cd Runtime_verification
pip install -r requirements.txt
python demo.py
```

## Quick Start with Storm (real model checker via Docker)

```bash
cd Runtime_verification

# Build the image (includes Storm + stormpy)
docker build -t agentguard-rv .

# Run the generic demo
MSYS_NO_PATHCONV=1 docker run --rm -v "${PWD}:/app" agentguard-rv

# Run the liquidation-bot failure demo
MSYS_NO_PATHCONV=1 docker run --rm -v "${PWD}:/app" agentguard-rv liquidation
```

> **Windows Git Bash tip:** the `MSYS_NO_PATHCONV=1` prefix prevents Git Bash
> from mangling the volume-mount path.

---

## Demos

### `demo.py` — Generic Agent Demo

Simulates a generic AI agent cycling through states and verifies PCTL properties on the fly.  Runs with the mock checker by default; Storm is used automatically when `AGENTGUARD_USE_STORM=1`.

### `demo_liquidation.py` — Liquidation Bot Failure Demo

Demonstrates AgentGuard detecting a **stuck-in-reversion-loop** scenario for a DeFi liquidation bot.

**Scenario:**  
The previous healthy run is stored in `latest_model.prism` and loaded as a lightweight baseline (`seed_weight: 5` ≈ 30 virtual transitions).  The demo then simulates degraded market conditions where 90 % of `submit_tx` calls revert on-chain.  As new observations accumulate they dilute the healthy seed and the expected-cycles metric climbs:

| Verification | E\[cycles\] | Status |
|---|---|---|
| #1 (t ≈ 10) | ~8.6 | OK — baseline still dominant |
| #2 (t ≈ 20) | ~11.8 | **WARNING** — drift detected |
| #3 (t ≈ 30) | ~14.5 | **WARNING** — rising further |
| #4 (t ≈ 40) | ~16.7 | **CRITICAL** — bot halted to prevent gas drain |

---

## Configuration

All verification rules live in a YAML file — **no agent code changes needed** to modify the analysis.

```yaml
agent:
  name: "LiquidationBot"
  verification_interval: 5   # run model checker every N transitions

# Load the previous run's model as a baseline.
# seed_weight: how many virtual counts each probability unit contributes
#   (100 = production default; 5 = demo — shifts faster under degradation)
seed_from_previous: true
seed_weight: 5

states:
  - "Opportunity_Spotted"    # first state = initial state
  - "TX_Construction"
  - "On_Chain_Revert"
  - "TX_Confirmed"
  - "Network_Error"

properties:
  min_expected_cycles: "Rmin=?[ F \"TX_Confirmed\" ]"   # expected gas cost
  max_prob_success:    "Pmax=? [ F \"TX_Confirmed\" ]"

actions:
  - "fetch_data"
  - "submit_tx"
  - "adjust_params"
  - "finalize"

safety_thresholds:
  min_prob_success:    0.80   # intervene if P(eventual success) < 80 %
  max_expected_cycles: 10.0   # intervene if expected steps > 10
```

### Key config fields

| Field | Default | Description |
|---|---|---|
| `verification_interval` | `10` | Transitions between model-checker runs |
| `seed_from_previous` | `true` | Load `latest_model.prism` as a prior baseline |
| `seed_weight` | `100` | Virtual counts per probability unit when seeding.  Lower values let live data shift the model faster |
| `prism_output` | `latest_model.prism` | Path where the current PRISM model is written after each run |

---

## Instrumenting Your Agent

```python
from agentguard import AgentGuardLogger

def on_alert(result):
    print(f"[!] {result.check.property_name} = {result.check.value:.4f}")

def on_intervene(result):
    print(f"[X] HALTING — {result.check.property_name} critically breached")
    raise SystemExit(1)

guard = AgentGuardLogger(
    "config.yaml",
    on_alert=on_alert,
    on_intervene=on_intervene,
)

# Inside your agent loop:
guard.log_transition("idle", "search", "searching")
guard.log_transition("searching", "summarize", "done")

guard.shutdown()
```

---

## Project Structure

```
Runtime_verification/
├── agentguard/
│   ├── __init__.py          # Package exports (AgentGuardLogger)
│   ├── config_loader.py     # YAML config parser → AgentGuardConfig
│   ├── logger.py            # AgentGuardLogger  (user-facing API)
│   ├── analyzer.py          # AnalyzerThread    (background engine)
│   ├── mdp.py               # Online MDP learner (counts + seeding)
│   ├── prism_converter.py   # MDPModel → PRISM language
│   ├── model_checker.py     # Storm (real) / Mock checker
│   └── actuator.py          # Dashboard + threshold callbacks
├── config.yaml              # Generic demo config
├── config_liquidation.yaml  # Liquidation bot config
├── demo.py                  # Generic agent demo
├── demo_liquidation.py      # Liquidation bot failure demo
├── latest_model.prism       # Most recent learned model (auto-updated)
├── requirements.txt         # Python deps (pyyaml; stormpy optional)
├── Dockerfile               # Container with Storm pre-installed
└── entrypoint.sh            # Selects demo vs liquidation on startup
```

---

## Components (Paper Mapping)

| Paper Component | Implementation |
|---|---|
| Trace Monitor & Event Abstraction | `AgentGuardLogger.log_transition()` |
| Online Model Learner | `MDPModel` in `mdp.py` |
| Probabilistic Model Checker | `ModelChecker` in `model_checker.py` + `PRISMConverter` |
| Assurance Dashboard & Actuator | `Actuator` in `actuator.py` |

---

## How the Baseline / Seed Works

```
Previous run writes  latest_model.prism
         │
         ▼  load_from_prism(seed_weight=W)
     Each PRISM probability p  →  max(1, int(p × W))  virtual counts
         │
         ▼
     Live transitions are added on top.
     As new evidence accumulates the empirical probabilities shift
     away from the seed — AgentGuard detects the drift.
```

- **`seed_weight: 100`** (default) — ~500 virtual transitions; healthy for production where gradual drift should not over-react to short bursts.  
- **`seed_weight: 5`** (demo) — ~30 virtual transitions; a single stuck-in-loop episode (~40 transitions) is enough to push `E[cycles]` past the threshold and trigger intervention.
