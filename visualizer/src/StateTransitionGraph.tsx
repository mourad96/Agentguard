import { useEffect, useMemo } from "react";
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { TransitionRecord } from "./data/mockAgentData";

type Props = {
  transitions: TransitionRecord[];
  activeNode?: string | null;
  isHalted?: boolean;
  isStuttering?: boolean;
};

function buildFlowFromTransitions(transitions: TransitionRecord[]): {
  nodes: Node[];
  edges: Edge[];
} {
  const states = new Set<string>();
  transitions.forEach((t) => {
    states.add(t.from);
    states.add(t.to);
  });

  const initial = states.has("idle") ? "idle" : [...states][0];
  const layer = new Map<string, number>();
  const queue: string[] = [initial];
  layer.set(initial, 0);

  while (queue.length > 0) {
    const s = queue.shift()!;
    const base = layer.get(s) ?? 0;
    transitions
      .filter((t) => t.from === s)
      .forEach((t) => {
        if (!layer.has(t.to)) {
          layer.set(t.to, base + 1);
          queue.push(t.to);
        }
      });
  }

  for (const s of states) {
    if (!layer.has(s)) layer.set(s, 0);
  }

  const byLayer = new Map<number, string[]>();
  for (const s of states) {
    const L = layer.get(s) ?? 0;
    const row = byLayer.get(L) ?? [];
    row.push(s);
    byLayer.set(L, row);
  }

  const nodes: Node[] = [];
  byLayer.forEach((ids, L) => {
    ids.sort().forEach((id, i) => {
      nodes.push({
        id,
        position: { x: L * 280, y: i * 120 },
        data: { label: id.replace(/_/g, ' ') },
        style: {
          background: "rgba(20, 25, 35, 0.85)",
          color: "#fff",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          backdropFilter: "blur(12px)",
          borderRadius: "12px",
          padding: "16px",
          width: 160,
          textAlign: "center",
          fontSize: "14px",
          fontWeight: 600,
          boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.3)",
          transition: "transform 0.2s ease",
        },
      });
    });
  });

  const edges: Edge[] = transitions.map((t, idx) => ({
    id: `${t.from}-${t.action}-${t.to}-${idx}`,
    source: t.from,
    target: t.to,
    label: t.labelStr ?? t.action.toUpperCase(),
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed, color: "#6366f1" },
    style: { stroke: "#6366f1", strokeWidth: 2 },
    labelStyle: { fill: "#a5b4fc", fontSize: 11, fontWeight: "bold" },
    labelBgStyle: { fill: "#1e1b4b" },
    labelBgPadding: [6, 4] as [number, number],
    labelBgBorderRadius: 6,
  }));

  return { nodes, edges };
}

export function StateTransitionGraph({ transitions, activeNode, isHalted, isStuttering }: Props) {
  const built = useMemo(
    () => buildFlowFromTransitions(transitions),
    [transitions],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(built.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(built.edges);

  useEffect(() => {
    setNodes(built.nodes);
    setEdges(built.edges);
  }, [built, setNodes, setEdges]);

  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => {
        let isActive = n.id === activeNode;
        // States Mapping:
        // s0: Network_Error (Red)
        // s1: On_Chain_Revert (Orange)
        // s2: TX_Confirmed (Green)
        // s3: TX_Construction (Blue)
        // s4: Opportunity_Spotted (Cyan/Purple)
        
        let nodeColor = "rgba(20, 25, 35, 0.85)";
        let borderColor = "rgba(255, 255, 255, 0.1)";
        let shadowColor = "rgba(0, 0, 0, 0.3)";

        if (n.id === "TX_Confirmed") {
          borderColor = isActive ? "#10b981" : "rgba(16, 185, 129, 0.3)";
          if (isActive) shadowColor = "rgba(16, 185, 129, 0.6)";
        } else if (n.id === "On_Chain_Revert") {
          borderColor = isActive ? "#f59e0b" : "rgba(245, 158, 11, 0.3)";
          if (isActive) shadowColor = "rgba(245, 158, 11, 0.6)";
        } else if (n.id === "Network_Error") {
          borderColor = isActive ? "#ef4444" : "rgba(239, 68, 68, 0.3)";
          if (isActive) shadowColor = "rgba(239, 68, 68, 0.6)";
        } else if (n.id === "TX_Construction") {
          borderColor = isActive ? "#3b82f6" : "rgba(59, 130, 246, 0.3)";
          if (isActive) shadowColor = "rgba(59, 130, 246, 0.6)";
        } else if (n.id === "Opportunity_Spotted") {
          borderColor = isActive ? "#8b5cf6" : "rgba(139, 92, 246, 0.3)";
          if (isActive) shadowColor = "rgba(139, 92, 246, 0.6)";
        }

        let isStutterTarget = isStuttering && (n.id === "TX_Construction" || n.id === "On_Chain_Revert");
        let isHaltedNode = isHalted && (n.id === "TX_Construction" || n.id === "On_Chain_Revert");

        if (isStutterTarget) {
          borderColor = "#dc2626";
          shadowColor = "rgba(220, 38, 38, 0.8)";
        }

        if (isHaltedNode) {
          borderColor = "#ef4444";
          shadowColor = "rgba(239, 68, 68, 0.9)";
        }

        return {
          ...n,
          data: {
            label: (
              <div style={{ position: "relative" }}>
                {isHaltedNode && (
                  <div 
                    style={{ 
                      position: 'absolute', top: -35, left: '50%', transform: 'translateX(-50%)', 
                      background: '#ef4444', color: '#fff', padding: '4px 10px', borderRadius: 4, 
                      fontSize: 10, fontWeight: 'bold', whiteSpace: 'nowrap', zIndex: 10,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.5)', border: '1px solid #fff'
                    }}
                  >
                    HALTED BY AGENTGUARD
                  </div>
                )}
                <div style={{ fontSize: '10px', opacity: 0.7, marginBottom: '2px' }}>{n.id}</div>
                {n.id.replace(/_/g, ' ')}
              </div>
            )
          },
          style: {
            ...n.style,
            boxShadow: `0 8px 32px 0 ${shadowColor}`,
            border: isActive || isStutterTarget || isHaltedNode ? `2px solid ${borderColor}` : `1px solid ${borderColor}`,
            background: nodeColor,
            transform: isActive ? 'scale(1.05)' : 'scale(1)',
          },
        };
      })
    );

    setEdges((eds) => 
      eds.map((e) => {
        let isStutterEdge = isStuttering && 
          ((e.source === "TX_Construction" && e.target === "On_Chain_Revert") || 
           (e.source === "On_Chain_Revert" && e.target === "TX_Construction"));
        
        if (isStutterEdge) {
          return {
            ...e,
            animated: true,
            style: { stroke: "#dc2626", strokeWidth: 4, strokeDasharray: '5,5' },
            markerEnd: { type: MarkerType.ArrowClosed, color: "#dc2626" },
          };
        }
        
        return {
          ...e,
          animated: true,
          style: { stroke: "#6366f1", strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: "#6366f1" },
        };
      })
    );
  }, [activeNode, setNodes, setEdges, isHalted, isStuttering]);

  return (
    <div className="transition-graph">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ type: "smoothstep" }}
      >
        <Background color="rgba(255, 255, 255, 0.05)" gap={16} />
        <Controls />
        <MiniMap
          nodeStrokeWidth={2}
          maskColor="rgba(15, 17, 21, 0.85)"
          className="transition-graph__minimap"
          style={{ backgroundColor: "#1e1b4b" }}
        />
      </ReactFlow>
    </div>
  );
}
