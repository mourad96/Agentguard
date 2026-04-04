# AgentGuard — Runtime Verification

Framework-agnostic, non-intrusive middleware that monitors AI agent behavior and performs formal verification using probabilistic model checking.

## Architecture

```
Agent Code (any framework)
    │
    ▼  log_transition()
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

**AgentGuardLogger** — Lightweight API that drops transition events into a queue (~1 ms).  
**AnalyzerThread** — Background thread that builds an MDP, converts it to PRISM, and runs probabilistic model checking.  
**Actuator** — Prints a dashboard and fires user-defined callbacks when safety thresholds are breached.

## Quick Start

```bash
# Install dependencies
pip install -r requirements.txt

# Run the demo
python demo.py
```

## Configuration

All verification rules are defined in `config.yaml` — **no agent code changes needed** to modify analysis:

```yaml
agentguard:
  states:
    - name: "idle"
      is_initial: true
    - name: "done"
      is_goal: true
    - name: "error"
      is_error: true

  properties:
    - name: "Goal Reachability"
      pctl: 'Pmax=? [F "goal"]'
      threshold: 0.7
      direction: "above"
```

## Instrumenting Your Agent

```python
from agentguard import AgentGuardLogger

guard = AgentGuardLogger("config.yaml")

# In your agent loop:
guard.log_transition("idle", "search", "searching")
guard.log_transition("searching", "summarize", "summarizing")
# ...

guard.shutdown()
```

## Using Storm (Real Model Checker)

The POC includes a **mock model checker** by default for portability. To use the real Storm model checker:

```bash
# Build and run the Docker container
docker build -t agentguard .
# Use volume mounting to persist latest_model.prism
# (On Windows Git Bash, MSYS_NO_PATHCONV=1 avoids path conversion issues)
MSYS_NO_PATHCONV=1 docker run --rm -v "${PWD}:/app" agentguard
```

Or set the environment variable:
```bash
export AGENTGUARD_USE_STORM=1
```

## Project Structure

```
Runtime_verification/
├── agentguard/
│   ├── __init__.py          # Package exports
│   ├── config_loader.py     # YAML configuration parser
│   ├── logger.py            # AgentGuardLogger (user-facing API)
│   ├── analyzer.py          # AnalyzerThread (background engine)
│   ├── mdp.py               # Online MDP learner
│   ├── prism_converter.py   # MDP → PRISM language converter
│   ├── model_checker.py     # Storm / Mock model checker
│   └── actuator.py          # Dashboard + threshold callbacks
├── config.yaml              # Verification rules (PCTL properties)
├── demo.py                  # Self-contained demo
├── requirements.txt         # Python dependencies
└── Dockerfile               # Container with Storm pre-installed
```

## Components (Paper Mapping)

| Paper Component               | Implementation           |
|-------------------------------|--------------------------|
| Trace Monitor & Event Abstraction | `AgentGuardLogger.log_transition()` |
| Online Model Learner          | `MDPModel` (mdp.py)     |
| Probabilistic Model Checker   | `ModelChecker` (model_checker.py) + `PRISMConverter` |
| Assurance Dashboard & Actuator | `Actuator` (actuator.py) |
