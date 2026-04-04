import { useMemo } from "react";
import {
  Background,
  ReactFlow,
  MarkerType,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

type Props = {
  activeNode?: string | null;
};

const NODES: Node[] = [
  {
    id: "Opportunity_Spotted", // s4
    position: { x: 300, y: 0 },
    data: { label: "S4: Opportunity_Spotted" },
    // Default node has top and bottom handles
  },
  {
    id: "TX_Construction", // s3
    position: { x: 300, y: 150 },
    data: { label: "S3: TX_Construction" },
  },
  {
    id: "TX_Confirmed", // s2
    position: { x: 50, y: 350 },
    data: { label: "S2: TX_Confirmed" },
  },
  {
    id: "On_Chain_Revert", // s1
    position: { x: 300, y: 350 },
    data: { label: "S1: On_Chain_Revert" },
  },
  {
    id: "Network_Error", // s0
    position: { x: 550, y: 350 },
    data: { label: "S0: Network_Error" },
  },
];

const EDGES: Edge[] = [
  // Forward Flow
  { 
    id: "e43", source: "Opportunity_Spotted", target: "TX_Construction", 
    label: "fetch_data",
  },
  
  { 
    id: "e32", source: "TX_Construction", target: "TX_Confirmed", 
    label: "submit_tx (0.50)", type: 'smoothstep',
  },
  { 
    id: "e31", source: "TX_Construction", target: "On_Chain_Revert", 
    label: "submit_tx (0.33)",
  },
  { 
    id: "e30", source: "TX_Construction", target: "Network_Error", 
    label: "submit_tx (0.17)", type: 'smoothstep',
  },

  // Return Paths (using smoothstep and side routing to avoid overlap)
  { 
    id: "e24", source: "TX_Confirmed", target: "Opportunity_Spotted", 
    label: "finalize", type: 'smoothstep',
    labelStyle: { fill: "#10b981" },
    style: { stroke: "#10b981", strokeDasharray: '5,5', opacity: 0.6 }
  },
  { 
    id: "e13", source: "On_Chain_Revert", target: "TX_Construction", 
    label: "retry", type: 'smoothstep',
    labelStyle: { fill: "#f59e0b" },
    style: { stroke: "#f59e0b", strokeDasharray: '5,5', opacity: 0.6 }
  },
  { 
    id: "e04", source: "Network_Error", target: "Opportunity_Spotted", 
    label: "reset", type: 'smoothstep',
    labelStyle: { fill: "#ef4444" },
    style: { stroke: "#ef4444", strokeDasharray: '5,5', opacity: 0.6 }
  },
];

const nodeStyle = {
  background: "#0f172a",
  color: "#f8fafc",
  border: "2px solid #334155",
  borderRadius: "12px",
  padding: "16px",
  fontSize: "14px",
  fontWeight: "bold",
  width: 200,
  textAlign: "center" as const,
  boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
  transition: 'all 0.3s ease',
};

const activeNodeStyle = {
  ...nodeStyle,
  border: "2px solid #6366f1",
  boxShadow: "0 0 20px rgba(99, 102, 241, 0.5)",
  background: "#1e1b4b",
};

const defaultEdgeOptions = {
  animated: true,
  style: { stroke: "#6366f1", strokeWidth: 2.5 },
  labelStyle: { fill: "#cbd5e1", fontWeight: 700, fontSize: 11 },
  labelBgStyle: { fill: "#020617", fillOpacity: 0.9 },
  labelBgPadding: [6, 4] as [number, number],
  labelBgBorderRadius: 6,
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: "#6366f1",
  },
};

export function StateTransitionGraph({ activeNode }: Props) {
  const nodes = useMemo(() => NODES.map(node => ({
    ...node,
    style: node.id === activeNode ? activeNodeStyle : nodeStyle
  })), [activeNode]);

  return (
    <div style={{ width: "100%", height: "100%", background: "#020617" }}>
      <ReactFlow
        nodes={nodes}
        edges={EDGES}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#1e293b" variant={"dots" as any} gap={20} size={1} />
      </ReactFlow>
    </div>
  );
}
