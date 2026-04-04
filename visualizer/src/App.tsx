import { useState, useEffect, useCallback } from "react";
import { ReactFlowProvider, type Node, type Edge } from "@xyflow/react";

import { StateTransitionGraph } from "./StateTransitionGraph";
import { parsePrism } from "./utils/prismParser";
import { 
  mockTransitions, 
  INITIAL_PROPERTIES,
  type AGProperty
} from "./data/mockAgentData";
import "./App.css";

export default function App() {
  const [modelName, setModelName] = useState("Default Model");
  const [step, setStep] = useState(1);
  const [properties, setProperties] = useState<AGProperty[]>(INITIAL_PROPERTIES);
  const [isSimulating, setIsSimulating] = useState(true);
  const [activeNode, setActiveNode] = useState("Opportunity_Spotted");
  const [stutterCount, setStutterCount] = useState(0);
  const [isHalted, setIsHalted] = useState(false);

  const [graphData, setGraphData] = useState<{ nodes: Node[], edges: Edge[] }>({ nodes: [], edges: [] });

  const refreshModel = useCallback(async (isInitial = false) => {
    try {
      const res = await fetch("/model.prism");
      if (!res.ok) throw new Error("Failed to fetch model.prism");
      const content = await res.text();
      const parsed = parsePrism(content);
      setGraphData(parsed);
      if (!isInitial) {
        setModelName("Failure Scenario");
      }
    } catch (err) {
      console.error("Error refreshing model:", err);
    }
  }, []);

  useEffect(() => {
    refreshModel(true);
  }, [refreshModel]);

  useEffect(() => {
    const hasViolation = properties.some(p => p.status === "[VIOLATED]") || isHalted;
    if (hasViolation && isSimulating) {
      setIsHalted(true);
      setIsSimulating(false);
    }
  }, [properties, isSimulating, isHalted]);



  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isSimulating) {
      interval = setInterval(() => {
        setStep(s => {
          const nextStep = s + 1;
          
          if (nextStep % 3 === 0) {
            setProperties(prev => {
              const newProps = [...prev];
              
              const probIndex = newProps.findIndex(p => p.name === "max_prob_success");
              if (probIndex !== -1) {
                // Diminish Pmax as stutterCount increases
                // Base 0.746 (prob of s2 before s0)
                let newVal = 0.746 * Math.pow(0.85, stutterCount);
                newProps[probIndex].value = newVal;
                newProps[probIndex].status = newVal >= newProps[probIndex].threshold ? "[OK]" : "[VIOLATED]";
              }

              const cyclesIndex = newProps.findIndex(p => p.name === "min_expected_cycles");
              if (cyclesIndex !== -1) {
                // Increase Rmin as stutterCount increases (simulating gas/time cost)
                let newVal = 2.5 + (stutterCount * 4) + (Math.random() * 2);
                newProps[cyclesIndex].value = newVal;
                newProps[cyclesIndex].status = newVal <= newProps[cyclesIndex].threshold ? "[OK]" : "[VIOLATED]";
              }

              return newProps;
            });
          }
          
          setActiveNode(curr => {
            const available = mockTransitions.filter(t => t.from === curr);
            if (available.length === 0) return curr;
            
            const r = Math.random();
            let cum = 0;
            let next = available[available.length - 1].to;
            for (const t of available) {
              const prob = t.probability ?? 1.0;
              cum += prob;
              if (r <= cum) {
                next = t.to;
                break;
              }
            }

            // Stutter Logic: s3 <-> s1
            if (curr === "TX_Construction" && next === "On_Chain_Revert") {
              setStutterCount(c => {
                const newVal = c + 1;
                if (newVal > 2) {
                  setIsHalted(true); // Fire actuator event (visual)
                }
                return newVal;
              });
            } else if (next === "TX_Confirmed" || next === "Network_Error") {
              // Reset stutter if we break the loop towards a terminal state (in this cycle)
              setStutterCount(0);
            }

            return next;
          });

          return nextStep;
        });
      }, 700); 
    }
    return () => clearInterval(interval);
  }, [isSimulating, stutterCount]);

  return (
    <div className="app">
      <div className="ambient-background" />
      <header className="app__header">
        <div>
          <h1 className="app__title">AgentGuard Dashboard</h1>
          <p className="app__subtitle">
            Agent Verification & State Machine Monitoring
          </p>
        </div>
        <div className="header__controls">
          <button 
            className="btn-simulate active"
            onClick={() => refreshModel(false)}
          >
            🔄 Refresh Diagram
          </button>
          <span className="step-counter">{modelName}</span>
        </div>
      </header>

      <main className="app__main">
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel panel--graph" aria-label="Agent Architecture">
            <div className="panel__head">
              <h2 className="panel__title">Agent State Machine</h2>
              <span className="panel__badge">Architecture Reference</span>
            </div>
            <div className="transition-graph">
              <ReactFlowProvider>
                <StateTransitionGraph 
                  nodes={graphData.nodes}
                  edges={graphData.edges}
                  activeNode={activeNode} 
                />
              </ReactFlowProvider>
            </div>
          </div>
      </main>
    </div>
  );
}
