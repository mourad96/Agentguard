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

  const loadGraph = useCallback(async () => {
    try {
      const res = await fetch("/latest_model.prism?" + Date.now());
      if (!res.ok) throw new Error("Failed to fetch latest_model.prism");
      const content = await res.text();
      setGraphData(parsePrism(content));
    } catch (err) {
      console.error("Error loading latest_model.prism:", err);
    }
  }, []);

  const refreshModel = useCallback(async () => {
    try {
      // 1. Refresh Graph
      const res = await fetch("/latest_model.prism?" + Date.now());
      if (!res.ok) throw new Error("Failed to fetch latest_model.prism");
      const content = await res.text();
      setGraphData(parsePrism(content));

      // 2. Fetch and Parse Metrics from dashboard_report.txt
      // Format: "  property_name    value    threshold    dir   [OK]/[!]"
      const resMetrics = await fetch("/dashboard_report.txt?" + Date.now());
      if (!resMetrics.ok) throw new Error("Failed to fetch dashboard_report.txt");
      const reportContent = await resMetrics.text();

      // Data rows start with two spaces and a lowercase letter, skip header/separator lines
      const dataRowRegex = /^\s{2}([a-z_]+)\s+([\d.]+)\s+([\d.]+|N\/A)\s+\S+\s+(\[OK\]|\[!\])/;
      const parsedProps = reportContent
        .split("\n")
        .map(line => {
          const m = line.match(dataRowRegex);
          if (!m) return null;
          const [, name, valueStr, thresholdStr, rawStatus] = m;
          return {
            name,
            value: parseFloat(valueStr),
            threshold: thresholdStr,
            status: rawStatus === "[!]" ? "[X]" : "[OK]" as "[OK]" | "[X]",
          };
        })
        .filter(Boolean) as { name: string; value: number; threshold: string; status: "[OK]" | "[X]" }[];

      setProperties(parsedProps);

      // 3. Update Model Name and Status
      const hasFailure = parsedProps.some(p => p.status === "[X]");
      setModelName(hasFailure ? "Failure Scenario" : "Default Model");

    } catch (err) {
      console.error("Error refreshing model:", err);
    }
  }, []);

  // On mount: load graph nodes only; properties stay empty until Refresh is clicked
  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

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
