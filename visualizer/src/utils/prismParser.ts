import type { Node, Edge } from "@xyflow/react";
import { MarkerType } from "@xyflow/react";

export interface ParsedPrism {
  nodes: Node[];
  edges: Edge[];
}

export function parsePrism(content: string): ParsedPrism {
  const labels: Record<string, string[]> = {};
  const labelRegex = /label\s+"([^"]+)"\s*=\s*s=(\d+);/g;
  let match;

  while ((match = labelRegex.exec(content)) !== null) {
    const s = match[2];
    const name = match[1];
    if (!labels[s]) labels[s] = [];
    labels[s].push(name);
  }

  const nodesMap: Map<string, Node> = new Map();
  const edges: Edge[] = [];
  const transRegex = /\[([a-z_]+)\]\s*s=(\d+)\s*->\s*([^;]+);/g;

  while ((match = transRegex.exec(content)) !== null) {
    const action = match[1];
    const sourceS = match[2];
    
    // Choose the best label (usually the one that doesn't match an action name)
    const sLabels = labels[sourceS] || [];
    const sourceId = sLabels.find(l => l !== action && !l.includes('data')) || sLabels[0] || `S${sourceS}`;
    
    // Source Node
    if (!nodesMap.has(sourceId)) {
      nodesMap.set(sourceId, {
        id: sourceId,
        data: { label: `S${sourceS}: ${sourceId.replace(/_/g, ' ')}` },
        position: { x: 0, y: 0 },
      });
    }

    const rhs = match[3];
    const parts = rhs.split("+").map(p => p.trim());
    parts.forEach((part, idx) => {
      let prob = "1.00";
      let targetS = "";

      const probMatch = part.match(/([\d\.]+):\s*\(s'=(\d+)\)/);
      if (probMatch) {
         prob = probMatch[1];
         targetS = probMatch[2];
      } else {
         const directMatch = part.match(/\(s'=(\d+)\)/);
         if (directMatch) targetS = directMatch[1];
      }

      if (targetS) {
        const tLabels = labels[targetS] || [];
        // Heuristic: pick the longest label or the one that doesn't match an action
        const targetId = tLabels.find(l => l.length > 5 && !l.includes('data')) || tLabels[0] || `S${targetS}`;
        
        if (!nodesMap.has(targetId)) {
          nodesMap.set(targetId, {
            id: targetId,
            data: { label: `S${targetS}: ${targetId.replace(/_/g, ' ')}` },
            position: { x: 0, y: 0 },
          });
        }

        const edgeId = `e-${sourceId}-${targetId}-${action}-${idx}`;
        edges.push({
          id: edgeId,
          source: sourceId,
          target: targetId,
          label: parseFloat(prob) < 1 ? `${action} (${parseFloat(prob).toFixed(2)})` : action,
          animated: true,
          type: 'smoothstep',
          markerEnd: { type: MarkerType.ArrowClosed, color: "#6366f1" }
        });
      }
    });
  }

  // Simple layout: S4 -> S3 -> {others}
  const nodes = Array.from(nodesMap.values()).map(n => {
    // Basic automatic layout based on numeric state if possible
    const label = n.data.label as string;
    const sMatch = label.match(/S(\d+):/);
    const s = sMatch ? parseInt(sMatch[1]) : 0;
    
    // Hardcoded layout logic for the 5-state model to keep it "clean"
    let x = 300;
    let y = 0;
    if (s === 4) { x = 300; y = 0; }
    else if (s === 3) { x = 300; y = 150; }
    else if (s === 2) { x = 50; y = 350; }
    else if (s === 1) { x = 300; y = 350; }
    else if (s === 0) { x = 550; y = 350; }
    else { x = s * 150; y = 500; } // Fallback

    return { ...n, position: { x, y } };
  });

  return { nodes, edges };
}
