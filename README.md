# AgentGuard: Dynamic Probabilistic Assurance

## Problem

While agentic systems offer immense capabilities, their non-deterministic nature makes them inherently unpredictable and introduces significant safety risks. Consequently, traditional software verification techniques—which rely on deterministic logic and manageable state spaces—are inadequate for these systems.

## Core Concept: Runtime Verification

AgentGuard learns the system on the fly. It updates its model and state space dynamically (e.g., every 5 iterations or transactions) and feeds this data into our model checker to verify behavior against specific safety thresholds. 

For example, the system can determine if a specific path will lead to success or if the transaction should be preemptively terminated.
