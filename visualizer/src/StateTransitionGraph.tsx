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
        data: { label: id.charAt(0).toUpperCase() + id.slice(1) },
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
    label: t.action.toUpperCase(),
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

export function StateTransitionGraph({ transitions }: Props) {
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
