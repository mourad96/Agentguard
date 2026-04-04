import { useState, useEffect, useCallback } from "react";
import { ReactFlowProvider, type Node, type Edge } from "@xyflow/react";

import { StateTransitionGraph } from "./StateTransitionGraph";
import { parsePrism } from "./utils/prismParser";
import { 
  mockTransitions, 
} from "./data/mockAgentData";
import "./App.css";

export default function App() {
  const [modelName, setModelName] = useState("Default Model");
  const [properties, setProperties] = useState<any[]>([]);
  const [isSimulating, setIsSimulating] = useState(true);
  const [activeNode, setActiveNode] = useState("Opportunity_Spotted");
  const [stutterCount, setStutterCount] = useState(0);
  const [isHalted, setIsHalted] = useState(false);
  // false on initial load → only boxes shown; true after first manual Refresh click → edges visible forever
  const [hasRefreshed, setHasRefreshed] = useState(false);

  const [graphData, setGraphData] = useState<{ nodes: Node[], edges: Edge[] }>({ nodes: [], edges: [] });

  const refreshModel = useCallback(async () => {
    try {
      // 1. Refresh Graph
      const res = await fetch("/model.prism?" + Date.now());
      if (!res.ok) throw new Error("Failed to fetch model.prism");
      const content = await res.text();
      const parsed = parsePrism(content);
      setGraphData(parsed);

      // 2. Fetch and Parse Metrics from modeloutput.txt
      const resMetrics = await fetch("/modeloutput.txt?" + Date.now());
      if (!resMetrics.ok) throw new Error("Failed to fetch modeloutput.txt");
      const csvContent = await resMetrics.text();
      
      const rows = csvContent.trim().split("\n");
      const parsedProps = rows.slice(1).map(row => {
          const parts = row.split(",");
          const property = parts[0];
          const value = parseFloat(parts[1]);
          const thresholdStr = parts[2];
          const thresholdVal = thresholdStr === "N/A" ? NaN : parseFloat(thresholdStr);
          
          let status: "[OK]" | "[X]" = "[OK]";
          if (property === "min_expected_cycles") {
              // Rule from User: OK if Threshold >= Value
              if (!isNaN(thresholdVal)) {
                  status = thresholdVal >= value ? "[OK]" : "[X]";
              }
          } else if (property === "max_prob_success") {
              // Rule from User: OK if Threshold <= Value
              if (!isNaN(thresholdVal)) {
                  status = thresholdVal <= value ? "[OK]" : "[X]";
              }
          } else if (property === "prob_stuck_in_revert") {
              // Rule from User: OK if Threshold >= Value
              if (thresholdStr === "N/A") {
                  status = "[OK]";
              } else if (!isNaN(thresholdVal)) {
                  status = thresholdVal >= value ? "[OK]" : "[X]";
              }
          }
          
          return {
              name: property,
              value: value,
              threshold: thresholdStr,
              status: status
          };
      });
      
      setProperties(parsedProps);

      // 3. Update Model Name and Status
      const hasFailure = parsedProps.some(p => p.status === "[X]");
      if (hasFailure) {
        setModelName("Failure Scenario");
      } else {
        setModelName("Default Model");
      }

    } catch (err) {
      console.error("Error refreshing model:", err);
    }
  }, []);

  useEffect(() => {
    refreshModel();
  }, [refreshModel]);

  useEffect(() => {
    const hasViolation = properties.some(p => p.status === "[X]") || isHalted;
    if (hasViolation && isSimulating) {
      setIsHalted(true);
      setIsSimulating(false);
    }
  }, [properties, isSimulating, isHalted]);



  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isSimulating && !isHalted) {
      interval = setInterval(() => {
          // Properties are now managed via modeloutput.txt refresh
          
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
            onClick={() => { setHasRefreshed(true); refreshModel(); }}
          >
            🔄 Refresh Diagram
          </button>
          <span className={`step-counter ${modelName === "Failure Scenario" ? "step-counter--failure" : ""}`}>
            {modelName}
          </span>
        </div>
      </header>

      <main className="app__main">
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
                  showEdges={hasRefreshed}
                />
              </ReactFlowProvider>
            </div>
          </div>

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
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {properties.map(p => (
                    <tr key={p.name} className={p.status === "[X]" ? "row-violated" : ""}>
                      <td className="prop-name">{p.name}</td>
                      <td className={p.status === "[X]" ? "value-error" : ""}>
                        {p.value.toFixed(4)}
                      </td>
                      <td>{p.threshold}</td>
                      <td className={`status ${p.status === "[OK]" ? "status-ok" : "status-viol"}`}>
                        {p.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
      </main>
    </div>
  );
}
