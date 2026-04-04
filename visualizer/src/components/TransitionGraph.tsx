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

import type { TransitionRecord } from "../data/mockAgentData";

type Props = {
  transitions: TransitionRecord[];
};

/**
 * 根据 (from, action, to) 列表自动生成节点位置（按 BFS 分层），并画出有向边。
 */
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
        position: { x: L * 240, y: i * 110 },
        data: { label: id },
      });
    });
  });

  const edges: Edge[] = transitions.map((t, idx) => ({
    id: `${t.from}-${t.action}-${t.to}-${idx}`,
    source: t.from,
    target: t.to,
    label: t.action,
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed, color: "#8b9bb4" },
    style: { stroke: "#6b7a90" },
    labelStyle: { fill: "#c5ced9", fontSize: 11 },
    labelBgStyle: { fill: "#1a1f28" },
    labelBgPadding: [4, 2] as [number, number],
    labelBgBorderRadius: 4,
  }));

  return { nodes, edges };
}

export function TransitionGraph({ transitions }: Props) {
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
        <Background color="#2a3140" gap={16} />
        <Controls />
        <MiniMap
          nodeStrokeWidth={2}
          maskColor="rgba(15, 17, 21, 0.85)"
          className="transition-graph__minimap"
        />
      </ReactFlow>
    </div>
  );
}
