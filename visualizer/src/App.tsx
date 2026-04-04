import { useState, useEffect } from "react";
import { ReactFlowProvider } from "@xyflow/react";

import { MetricsPanel } from "./MetricsPanel";
import { StateTransitionGraph } from "./StateTransitionGraph";
import { 
  mockTransitions, 
  initialMetrics, 
  INITIAL_PROPERTIES,
  type MetricPoint,
  type AGProperty
} from "./data/mockAgentData";
import "./App.css";

export default function App() {
  const [step, setStep] = useState(1);
  const [metricsHistory, setMetricsHistory] = useState<MetricPoint[]>(initialMetrics);
  const [properties, setProperties] = useState<AGProperty[]>(INITIAL_PROPERTIES);
  const [isSimulating, setIsSimulating] = useState(false);
  const [activeNodeIdx, setActiveNodeIdx] = useState(0);

  const activeNode = mockTransitions[activeNodeIdx % mockTransitions.length].from;

  const handleOverride = (name: string, valueStr: string) => {
    const val = parseFloat(valueStr);
    if (isNaN(val)) return;
    
    setProperties(prev => prev.map(p => {
      if (p.name !== name) return p;
      let status: "[OK]" | "[VIOLATED]" = "[OK]";
      if (p.direction === "below" && val > p.threshold) status = "[VIOLATED]";
      if (p.direction === "above" && val < p.threshold) status = "[VIOLATED]";
      return { ...p, value: val, status };
    }));
  };

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isSimulating) {
      interval = setInterval(() => {
        setStep(s => {
          const nextStep = s + 1;
          
          if (nextStep % 5 === 0) {
            setProperties(prev => {
              const newProps = [...prev];
              
              const probIndex = newProps.findIndex(p => p.name === "max_prob_success");
              if (probIndex !== -1) {
                let newVal = newProps[probIndex].value - (0.02 + 0.05 * Math.random());
                if (newVal < 0) newVal = 0;
                newProps[probIndex].value = newVal;
                newProps[probIndex].status = newVal >= newProps[probIndex].threshold ? "[OK]" : "[VIOLATED]";
              }

              const cyclesIndex = newProps.findIndex(p => p.name === "min_expected_cycles");
              if (cyclesIndex !== -1) {
                let newVal = newProps[cyclesIndex].value + (2 + 5 * Math.random());
                newProps[cyclesIndex].value = newVal;
                newProps[cyclesIndex].status = newVal <= newProps[cyclesIndex].threshold ? "[OK]" : "[VIOLATED]";
              }

              setMetricsHistory(hist => [
                ...hist,
                {
                  step: nextStep,
                  min_expected_cycles: newProps.find(p => p.name === "min_expected_cycles")?.value || 0,
                  max_prob_success: newProps.find(p => p.name === "max_prob_success")?.value || 0,
                  prob_missing_critical_action: newProps.find(p => p.name === "prob_missing_critical_action")?.value || 0,
                }
              ]);

              return newProps;
            });
          }
          
          setActiveNodeIdx(idx => idx + 1);
          return nextStep;
        });
      }, 600); 
    }
    return () => clearInterval(interval);
  }, [isSimulating]);

  return (
    <div className="app">
      <div className="ambient-background" />
      <header className="app__header">
        <div>
          <h1 className="app__title">AgentGuard Dashboard</h1>
          <p className="app__subtitle">
            Left: Verification & MDP State • Right: Dynamic Safety Constraints
          </p>
        </div>
        <div className="header__controls">
          <button 
            className={`btn-simulate ${isSimulating ? "active" : ""}`}
            onClick={() => setIsSimulating(!isSimulating)}
          >
            {isSimulating ? "⏸ Pause Simulation" : "▶ Start Simulation"}
          </button>
          <span className="step-counter">Step: {step}</span>
        </div>
      </header>

      <main className="app__main">
        <section className="left-pane">
          <div className="panel panel--properties">
            <div className="panel__head">
              <h2 className="panel__title">AgentGuard Properties</h2>
              <span className="panel__badge">Live Checks</span>
            </div>
            
            <div className="table-container">
              <table className="props-table">
                <thead>
                  <tr>
                    <th>Property</th>
                    <th>Value</th>
                    <th>Threshold</th>
                    <th>Dir</th>
                    <th>Status</th>
                    <th>Override</th>
                  </tr>
                </thead>
                <tbody>
                  {properties.map(p => (
                    <tr key={p.name} className={p.status === "[VIOLATED]" ? "row-violated" : ""}>
                      <td className="prop-name">{p.name}</td>
                      <td>{p.value.toFixed(4)}</td>
                      <td>{p.threshold}</td>
                      <td>{p.direction}</td>
                      <td className={`status ${p.status === "[OK]" ? "status-ok" : "status-viol"}`}>
                        {p.status}
                      </td>
                      <td>
                        <input 
                          type="number"
                          step="0.01"
                          className="override-input"
                          defaultValue={p.value}
                          onBlur={(e) => handleOverride(p.name, e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleOverride(p.name, e.currentTarget.value)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel panel--graph" aria-label="State Transition Diagram">
            <div className="panel__head">
              <h2 className="panel__title">State Transition Diagram</h2>
              <span className="panel__badge">React Flow</span>
            </div>
            <ReactFlowProvider>
              <StateTransitionGraph transitions={mockTransitions} activeNode={activeNode} />
            </ReactFlowProvider>
          </div>
        </section>

        <section className="right-pane">
          <div className="panel panel--charts" aria-label="Metrics Dashboard">
            <div className="panel__head">
              <h2 className="panel__title">Runtime Metrics</h2>
              <span className="panel__badge">Recharts</span>
            </div>
            <MetricsPanel metrics={metricsHistory} />
          </div>
        </section>
      </main>
    </div>
  );
}
