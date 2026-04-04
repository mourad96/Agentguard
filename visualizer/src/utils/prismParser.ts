import type { Node, Edge } from "@xyflow/react";
import { MarkerType } from "@xyflow/react";

export interface ParsedPrism {
  nodes: Node[];
  edges: Edge[];
}

function makeEdge(
  id: string,
  source: string,
  target: string,
  labelText: string,
  opts: {
    sourceHandle?: string;
    targetHandle?: string;
    edgeType?: 'straight' | 'smoothstep';
    labelPosition?: number;
    labelOffsetX?: number;
    labelOffsetY?: number;
    animated?: boolean;
  } = {}
): Edge {
  return {
    id,
    source,
    target,
    sourceHandle: opts.sourceHandle,
    targetHandle: opts.targetHandle,
    type: 'offsetEdge',
    animated: opts.animated ?? true,
    markerEnd: { type: MarkerType.ArrowClosed, color: "#6366f1" },
    data: {
      labelText,
      edgeType: opts.edgeType ?? 'straight',
      labelPosition: opts.labelPosition ?? 0.5,
      labelOffsetX: opts.labelOffsetX ?? 0,
      labelOffsetY: opts.labelOffsetY ?? 0,
    },
  };
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
  const rawEdges: Array<{
    action: string;
    sourceS: string;
    sourceId: string;
    targetS: string;
    targetId: string;
    prob: string;
  }> = [];

  const transRegex = /\[([a-z_]+)\]\s*s=(\d+)\s*->\s*([^;]+);/g;

  while ((match = transRegex.exec(content)) !== null) {
    const action = match[1];
    const sourceS = match[2];

    const sLabels = labels[sourceS] || [];
    const sourceId = sLabels.find(l => l !== action && !l.includes('data')) || sLabels[0] || `S${sourceS}`;

    if (!nodesMap.has(sourceId)) {
      nodesMap.set(sourceId, {
        id: sourceId,
        data: { label: `S${sourceS}: ${sourceId.replace(/_/g, ' ')}` },
        position: { x: 0, y: 0 },
      });
    }

    const rhs = match[3];
    const parts = rhs.split("+").map(p => p.trim());
    parts.forEach(part => {
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
        const targetId = tLabels.find(l => l.length > 5 && !l.includes('data')) || tLabels[0] || `S${targetS}`;

        if (!nodesMap.has(targetId)) {
          nodesMap.set(targetId, {
            id: targetId,
            data: { label: `S${targetS}: ${targetId.replace(/_/g, ' ')}` },
            position: { x: 0, y: 0 },
          });
        }

        rawEdges.push({ action, sourceS, sourceId, targetS, targetId, prob });
      }
    });
  }

  // hardcoded layout for the 5-state model
  const nodes: Node[] = Array.from(nodesMap.values()).map(n => {
    const label = n.data.label as string;
    const sMatch = label.match(/S(\d+):/);
    const s = sMatch ? parseInt(sMatch[1]) : 0;

    let x = 500, y = 0;
    if (s === 4) { x = 600; y = 100; }
    else if (s === 3) { x = 600; y = 380; }
    else if (s === 2) { x = 50;  y = 680; }
    else if (s === 1) { x = 600; y = 680; }
    else if (s === 0) { x = 1150; y = 680; }
    else { x = s * 250; y = 800; }

    return { ...n, position: { x, y }, type: 'stateNode' };
  });

  // Add Origin Node
  nodes.push({
    id: 'O',
    type: 'originNode',
    data: { label: '' },
    position: { x: 795, y: -20 }, // centered above S4 (S4 at x=600, width=400 → center=800, node width=10 → 795)
  });

  const finalEdges: Edge[] = [];
  const seenPairs = new Set<string>();

  // Origin edge — no label text, just the dot and arrow
  const opportunityId = nodes.find(n => n.id.includes('Opportunity'))?.id || 'Opportunity_Spotted';
  finalEdges.push(makeEdge('e-O-S4', 'O', opportunityId, '', {
    sourceHandle: 'bottom',
    targetHandle: 'top-center',
    edgeType: 'straight',
    animated: false,
  }));

  rawEdges.forEach(({ action, sourceId, targetId, prob }) => {
    const pair = `${sourceId}->${targetId}`;
    const labelText = `${action} (${parseFloat(prob).toFixed(4)})`;
    const isS3S1 = sourceId.includes('Construction') && targetId.includes('Revert');
    const isS1S3 = sourceId.includes('Revert') && targetId.includes('Construction');

    if (isS3S1) {
      // Left arrow: S3 bottom-left -> S1 top-left, label sits on the arrow
      finalEdges.push(makeEdge(`e-${sourceId}-${targetId}-${action}`, sourceId, targetId, labelText, {
        sourceHandle: 'bottom-left',
        targetHandle: 'top-left',
        edgeType: 'straight',
        labelPosition: 0.4,
        labelOffsetX: 0,
        labelOffsetY: 0,
      }));
    } else if (isS1S3) {
      if (seenPairs.has(pair)) return;
      // Right arrow: S1 top-right -> S3 bottom-right, label sits on the arrow
      finalEdges.push(makeEdge(`e-${sourceId}-${targetId}-${action}`, sourceId, targetId, labelText, {
        sourceHandle: 'source-top-right',
        targetHandle: 'target-bottom-right',
        edgeType: 'straight',
        labelPosition: 0.6,
        labelOffsetX: 0,
        labelOffsetY: 0,
      }));
      seenPairs.add(pair);
    } else {
      if (seenPairs.has(pair)) return;

      if (sourceId.includes('Construction') && targetId.includes('Confirmed')) {
        // S3 -> S2: diagonal left, label clearly pushed left
        finalEdges.push(makeEdge(`e-${sourceId}-${targetId}-${action}`, sourceId, targetId, labelText, {
          sourceHandle: 'bottom-left',
          targetHandle: 'top-center',
          edgeType: 'straight',
          labelPosition: 0.5,
          labelOffsetX: -140,
          labelOffsetY: 10,
        }));
      } else if (sourceId.includes('Construction') && targetId.includes('Error')) {
        // S3 -> S0: diagonal right, label clearly pushed right
        finalEdges.push(makeEdge(`e-${sourceId}-${targetId}-${action}`, sourceId, targetId, labelText, {
          sourceHandle: 'bottom-right',
          targetHandle: 'top-center',
          edgeType: 'straight',
          labelPosition: 0.5,
          labelOffsetX: 140,
          labelOffsetY: 10,
        }));
      } else if (targetId.includes('Opportunity')) {
        // Return arcs: S2->S4 (left side), S0->S4 (right side)
        if (sourceId.includes('Confirmed')) {
          finalEdges.push(makeEdge(`e-${sourceId}-${targetId}-${action}`, sourceId, targetId, labelText, {
            sourceHandle: 'left-source',
            targetHandle: 'left-target',
            edgeType: 'smoothstep',
            labelOffsetX: -20,
          }));
        } else if (sourceId.includes('Error')) {
          finalEdges.push(makeEdge(`e-${sourceId}-${targetId}-${action}`, sourceId, targetId, labelText, {
            sourceHandle: 'right-source',
            targetHandle: 'right-target',
            edgeType: 'smoothstep',
            labelOffsetX: 20,
          }));
        }
      } else if (sourceId.includes('Opportunity') && targetId.includes('Construction')) {
        // S4 -> S3 center vertical
        finalEdges.push(makeEdge(`e-${sourceId}-${targetId}-${action}`, sourceId, targetId, labelText, {
          sourceHandle: 'bottom-center',
          targetHandle: 'top-center',
          edgeType: 'straight',
          labelOffsetX: 60,
        }));
      } else {
        finalEdges.push(makeEdge(`e-${sourceId}-${targetId}-${action}`, sourceId, targetId, labelText, {
          edgeType: 'straight',
        }));
      }

      seenPairs.add(pair);
    }
  });

  return { nodes, edges: finalEdges };
}
