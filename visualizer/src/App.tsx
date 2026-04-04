import { ReactFlowProvider } from "@xyflow/react";

import { MetricsPanel } from "./MetricsPanel";
import { StateTransitionGraph } from "./StateTransitionGraph";
import { mockMetrics, mockTransitions } from "./data/mockAgentData";
import "./App.css";

export default function App() {
  return (
    <div className="app">
      <div className="ambient-background" />
      <header className="app__header">
        <div>
          <h1 className="app__title">AgentGuard Dashboard</h1>
          <p className="app__subtitle">
            Left: MDP state transitions • Right: Gas & Success Probability metrics
          </p>
        </div>
      </header>

      <main className="app__main">
        <section className="panel panel--graph" aria-label="State Transition Diagram">
          <div className="panel__head">
            <h2 className="panel__title">State Transition Diagram</h2>
            <span className="panel__badge">React Flow</span>
          </div>
          <ReactFlowProvider>
            <StateTransitionGraph transitions={mockTransitions} />
          </ReactFlowProvider>
        </section>

        <section className="panel panel--charts" aria-label="Metrics Dashboard">
          <div className="panel__head">
            <h2 className="panel__title">Runtime Metrics</h2>
            <span className="panel__badge">Recharts</span>
          </div>
          <MetricsPanel metrics={mockMetrics} />
        </section>
      </main>
    </div>
  );
}
