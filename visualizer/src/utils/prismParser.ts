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
          // Always show probability
          label: `${action} (${parseFloat(prob).toFixed(4)})`,
          animated: true,
          type: 'smoothstep',
          markerEnd: { type: MarkerType.ArrowClosed, color: "#6366f1" }
        });
      }
    });
  }

  // hardcoded layout for the 5-state model
  const nodes: Node[] = Array.from(nodesMap.values()).map(n => {
    const label = n.data.label as string;
    const sMatch = label.match(/S(\d+):/);
    const s = sMatch ? parseInt(sMatch[1]) : 0;
    
    // Strict Layout Coordinates with wider spread to avoid label overlap
    let x = 400;
    let y = 0;
    if (s === 4) { x = 400; y = 100; }
    else if (s === 3) { x = 400; y = 300; }
    else if (s === 2) { x = -100; y = 600; } // Increased Y for longer lines too
    else if (s === 1) { x = 400; y = 600; }
    else if (s === 0) { x = 900; y = 600; }
    else { x = s * 150; y = 700; }

    return { ...n, position: { x, y }, type: 'stateNode' };
  });

  // Add Origin Node 'O'
  nodes.push({
    id: 'O',
    type: 'originNode',
    data: { label: '' },
    position: { x: 495, y: 30 }, // Centered above S4 (S4 is at 400, width 200, so center 500. Node O is width 10, so 495)
  });

  // Add Origin Edge O -> S4
  edges.push({
    id: 'e-O-S4',
    source: 'O',
    target: nodes.find(n => n.id.includes('Opportunity'))?.id || 'Opportunity_Spotted',
    sourceHandle: 'bottom',
    targetHandle: 'top-center',
    type: 'straight',
    label: 'start (1.0000)',
    animated: false,
  });

  // Filter and Style Edges
  const finalEdges: Edge[] = [];
  const seenPairs = new Set<string>();

  edges.forEach(edge => {
    // Skip the origin edge we just added to process it specially if needed, but it's already in the list if we use finalEdges
    if (edge.id === 'e-O-S4') {
        finalEdges.push(edge);
        return;
    }

    const source = edge.source;
    const target = edge.target;
    const pair = `${source}->${target}`;
    
    // Consolidate: only take the first transition for a pair unless it's the S3 <-> S1 bi-directional
    const isS3S1 = (source.includes('Construction') && target.includes('Revert'));
    const isS1S3 = (source.includes('Revert') && target.includes('Construction'));

    if (isS3S1) {
        // Arrow 1: S3 -> S1 (center-bottom to center-top)
        edge.sourceHandle = 'bottom-left';
        edge.targetHandle = 'top-left';
        edge.type = 'straight';
        edge.labelPosition = 0.25; // Offset upwards to avoid overlap with return line
        finalEdges.push(edge);
    } else if (isS1S3) {
        // Arrow 2: S1 -> S3 (center-top to center-bottom)
        if (seenPairs.has(pair)) return; // Only one fetch_data arrow back
        edge.sourceHandle = 'source-top-right';
        edge.targetHandle = 'target-bottom-right';
        edge.type = 'straight';
        edge.labelPosition = 0.25; // Offset "upwards" relative to source S1, so it's towards the bottom of S3
        finalEdges.push(edge);
        seenPairs.add(pair);
    } else {
        if (seenPairs.has(pair)) return;
        
        // S3 -> S2, S3 -> S0
        if (source.includes('Construction')) {
            edge.type = 'straight';
            if (target.includes('Confirmed')) {
                edge.sourceHandle = 'bottom-left';
                edge.targetHandle = 'top-center';
            } else if (target.includes('Error')) {
                edge.sourceHandle = 'bottom-right';
                edge.targetHandle = 'top-center';
            }
        }
        // S2 -> S4, S0 -> S4 (Returns)
        else if (target.includes('Opportunity')) {
            edge.type = 'smoothstep';
            edge.animated = true;
            if (source.includes('Confirmed')) {
                edge.sourceHandle = 'left-source';
                edge.targetHandle = 'left-target';
            } else if (source.includes('Error')) {
                edge.sourceHandle = 'right-source';
                edge.targetHandle = 'right-target';
            }
        }
        // S4 -> S3
        else if (source.includes('Opportunity') && target.includes('Construction')) {
            edge.type = 'straight';
            edge.sourceHandle = 'bottom-center';
            edge.targetHandle = 'top-center';
        }
        finalEdges.push(edge);
        seenPairs.add(pair);
    }
  });

  return { nodes, edges: finalEdges };
}
