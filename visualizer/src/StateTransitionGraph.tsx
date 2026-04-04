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
  nodes?: Node[];
  edges?: Edge[];
};

const nodeStyle = (isActive: boolean) => ({
  background: isActive ? "#1e1b4b" : "#0f172a",
  color: "#f8fafc",
  border: isActive ? "2px solid #6366f1" : "2px solid #334155",
  borderRadius: "12px",
  padding: "16px",
  fontSize: "14px",
  fontWeight: "bold",
  width: 200,
  textAlign: "center" as const,
  boxShadow: isActive ? "0 0 20px rgba(99, 102, 241, 0.5)" : "0 10px 15px -3px rgb(0 0 0 / 0.1)",
  transition: 'all 0.3s ease',
});

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

export function StateTransitionGraph({ activeNode, nodes = [], edges = [] }: Props) {
  const styledNodes = useMemo(() => nodes.map(node => ({
    ...node,
    style: nodeStyle(node.id === activeNode)
  })), [nodes, activeNode]);

  return (
    <div style={{ width: "100%", height: "100%", background: "#020617" }}>
      <ReactFlow
        nodes={styledNodes}
        edges={edges}
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
