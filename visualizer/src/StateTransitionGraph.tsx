import { useMemo } from "react";
import {
  Background,
  ReactFlow,
  MarkerType,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
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
  borderRadius: "16px",
  padding: "24px",
  fontSize: "28px",
  fontWeight: "bold",
  width: 400,
  textAlign: "center" as const,
  boxShadow: isActive ? "0 0 20px rgba(99, 102, 241, 0.5)" : "0 10px 15px -3px rgb(0 0 0 / 0.1)",
  transition: 'all 0.3s ease',
  position: 'relative' as const,
});

const StateMachineNode = ({ data, selected }: NodeProps) => {
  return (
    <div style={nodeStyle(!!selected)}>
      {/* Dynamic Handles for strictly vertically distinct lines */}
      {/* Top Handles (both source and target) */}
      <Handle type="target" position={Position.Top} id="top-center" style={{ left: '50%', background: 'transparent', border: 'none' }} />
      <Handle type="target" position={Position.Top} id="top-left" style={{ left: '30%', background: 'transparent', border: 'none' }} />
      <Handle type="target" position={Position.Top} id="top-right" style={{ left: '70%', background: 'transparent', border: 'none' }} />
      <Handle type="source" position={Position.Top} id="source-top-right" style={{ left: '70%', background: 'transparent', border: 'none' }} />
      
      {/* Bottom Handles (both source and target) */}
      <Handle type="source" position={Position.Bottom} id="bottom-center" style={{ left: '50%', background: 'transparent', border: 'none' }} />
      <Handle type="source" position={Position.Bottom} id="bottom-left" style={{ left: '30%', background: 'transparent', border: 'none' }} />
      <Handle type="source" position={Position.Bottom} id="bottom-right" style={{ left: '70%', background: 'transparent', border: 'none' }} />
      <Handle type="target" position={Position.Bottom} id="target-bottom-right" style={{ left: '70%', background: 'transparent', border: 'none' }} />

      {/* Side Handles for wrap-around paths */}
      <Handle type="source" position={Position.Left} id="left-source" style={{ top: '50%', background: 'transparent', border: 'none' }} />
      <Handle type="target" position={Position.Left} id="left-target" style={{ top: '50%', background: 'transparent', border: 'none' }} />
      <Handle type="source" position={Position.Right} id="right-source" style={{ top: '50%', background: 'transparent', border: 'none' }} />
      <Handle type="target" position={Position.Right} id="right-target" style={{ top: '50%', background: 'transparent', border: 'none' }} />

      <div>{data.label as string}</div>
    </div>
  );
};

const OriginNode = () => (
  <div style={{ width: 10, height: 10, background: '#6366f1', borderRadius: '50%', boxShadow: '0 0 10px #6366f1' }}>
    <Handle type="source" position={Position.Bottom} id="bottom" style={{ background: 'transparent', border: 'none' }} />
  </div>
);

const nodeTypes = {
  stateNode: StateMachineNode,
  originNode: OriginNode,
};

const defaultEdgeOptions = {
  animated: true,
  style: { stroke: "#6366f1", strokeWidth: 4 },
  labelStyle: { fill: "#cbd5e1", fontWeight: 700, fontSize: 28 },
  labelBgStyle: { fill: "#020617", fillOpacity: 0.9 },
  labelBgPadding: [16, 12] as [number, number],
  labelBgBorderRadius: 8,
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: "#6366f1",
  },
};

export function StateTransitionGraph({ activeNode, nodes = [], edges = [] }: Props) {
  const styledNodes = useMemo(() => nodes.map(node => ({
    ...node,
    selected: node.id === activeNode,
    // Add type if not present based on data content
    type: node.id === 'O' ? 'originNode' : 'stateNode',
  })), [nodes, activeNode]);

  return (
    <div style={{ width: "100%", height: "100%", background: "#020617" }}>
      <ReactFlow
        nodes={styledNodes}
        edges={edges}
        nodeTypes={nodeTypes}
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
