import { useMemo } from "react";
import {
  Background,
  ReactFlow,
  MarkerType,
  Handle,
  Position,
<<<<<<< HEAD
  BaseEdge,
  EdgeLabelRenderer,
  getStraightPath,
  getSmoothStepPath,
  type Node,
  type Edge,
  type NodeProps,
  type EdgeProps,
=======
  type Node,
  type Edge,
  type NodeProps,
>>>>>>> 3105a2ce4127bf96af67103e14454b65acb55bff
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
<<<<<<< HEAD
      {/* Top Handles */}
      <Handle type="target" position={Position.Top} id="top-center" style={{ left: '50%', background: 'transparent', border: 'none' }} />
      <Handle type="target" position={Position.Top} id="top-left" style={{ left: '15%', background: 'transparent', border: 'none' }} />
      <Handle type="target" position={Position.Top} id="top-right" style={{ left: '85%', background: 'transparent', border: 'none' }} />
      <Handle type="source" position={Position.Top} id="source-top-right" style={{ left: '85%', background: 'transparent', border: 'none' }} />

      {/* Bottom Handles */}
      <Handle type="source" position={Position.Bottom} id="bottom-center" style={{ left: '50%', background: 'transparent', border: 'none' }} />
      <Handle type="source" position={Position.Bottom} id="bottom-left" style={{ left: '15%', background: 'transparent', border: 'none' }} />
      <Handle type="source" position={Position.Bottom} id="bottom-right" style={{ left: '85%', background: 'transparent', border: 'none' }} />
      <Handle type="target" position={Position.Bottom} id="target-bottom-right" style={{ left: '85%', background: 'transparent', border: 'none' }} />

      {/* Side Handles */}
=======
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
>>>>>>> 3105a2ce4127bf96af67103e14454b65acb55bff
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

<<<<<<< HEAD
// Custom edge that supports labelOffsetX / labelOffsetY via edge.data
function OffsetEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style,
  markerEnd,
  animated,
}: EdgeProps) {
  const edgeData = (data ?? {}) as Record<string, any>;
  const edgeType: string = edgeData.edgeType ?? 'straight';
  const labelOffsetX: number = edgeData.labelOffsetX ?? 0;
  const labelOffsetY: number = edgeData.labelOffsetY ?? 0;
  const labelText: string = edgeData.labelText ?? '';
  const labelPos: number = edgeData.labelPosition ?? 0.5;

  let edgePath = '';
  let labelX = 0;
  let labelY = 0;

  if (edgeType === 'smoothstep') {
    [edgePath, labelX, labelY] = getSmoothStepPath({
      sourceX, sourceY, targetX, targetY,
      sourcePosition, targetPosition,
    });
  } else {
    [edgePath, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });
    // Override labelX/Y based on labelPos along straight path
    labelX = sourceX + (targetX - sourceX) * labelPos;
    labelY = sourceY + (targetY - sourceY) * labelPos;
  }

  // Apply offsets
  const finalLabelX = labelX + labelOffsetX;
  const finalLabelY = labelY + labelOffsetY;

  const strokeStyle = {
    stroke: "#6366f1",
    strokeWidth: 4,
    strokeDasharray: animated ? "6 3" : undefined,
    ...style,
  };

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={strokeStyle} markerEnd={markerEnd as string} />
      {labelText && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${finalLabelX}px, ${finalLabelY}px)`,
              background: 'rgba(2, 6, 23, 0.92)',
              color: '#cbd5e1',
              fontSize: 22,
              fontWeight: 700,
              padding: '4px 10px',
              borderRadius: 6,
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
              zIndex: 10,
            }}
            className="nodrag nopan"
          >
            {labelText}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

=======
>>>>>>> 3105a2ce4127bf96af67103e14454b65acb55bff
const nodeTypes = {
  stateNode: StateMachineNode,
  originNode: OriginNode,
};

<<<<<<< HEAD
const edgeTypes = {
  offsetEdge: OffsetEdge,
};

const defaultEdgeOptions = {
  animated: true,
  style: { stroke: "#6366f1", strokeWidth: 4 },
=======
const defaultEdgeOptions = {
  animated: true,
  style: { stroke: "#6366f1", strokeWidth: 3 },
  labelStyle: { fill: "#cbd5e1", fontWeight: 700, fontSize: 15 },
  labelBgStyle: { fill: "#020617", fillOpacity: 0.9 },
  labelBgPadding: [8, 6] as [number, number],
  labelBgBorderRadius: 6,
>>>>>>> 3105a2ce4127bf96af67103e14454b65acb55bff
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: "#6366f1",
  },
};

export function StateTransitionGraph({ activeNode, nodes = [], edges = [] }: Props) {
  const styledNodes = useMemo(() => nodes.map(node => ({
    ...node,
    selected: node.id === activeNode,
<<<<<<< HEAD
=======
    // Add type if not present based on data content
>>>>>>> 3105a2ce4127bf96af67103e14454b65acb55bff
    type: node.id === 'O' ? 'originNode' : 'stateNode',
  })), [nodes, activeNode]);

  return (
    <div style={{ width: "100%", height: "100%", background: "#020617" }}>
      <ReactFlow
        nodes={styledNodes}
        edges={edges}
        nodeTypes={nodeTypes}
<<<<<<< HEAD
        edgeTypes={edgeTypes}
=======
>>>>>>> 3105a2ce4127bf96af67103e14454b65acb55bff
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={{ padding: 0.22 }}
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
