import { useEffect, useRef, useCallback } from "react";
import cytoscape, { type Core, type ElementDefinition } from "cytoscape";

interface CausalGraphViewerProps {
  graphData: { nodes: ElementDefinition[]; edges: ElementDefinition[] } | null;
  onNodeSelect?: (node: Record<string, unknown>) => void;
}

export function CausalGraphViewer({ graphData, onNodeSelect }: CausalGraphViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);

  const handleNodeTap = useCallback(
    (evt: cytoscape.EventObject) => {
      if (onNodeSelect) {
        onNodeSelect(evt.target.data());
      }
    },
    [onNodeSelect]
  );

  useEffect(() => {
    if (!containerRef.current || !graphData) return;

    const elements: ElementDefinition[] = [
      ...graphData.nodes,
      ...graphData.edges,
    ];

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      layout: { name: "cose", animate: true, animationDuration: 500 },
      style: [
        {
          selector: "node[type='feature']",
          style: {
            "background-color": "#3B82F6",
            label: "data(label)",
            color: "#F1F5F9",
            "text-valign": "center",
            "font-size": 10,
            width: 40,
            height: 40,
          },
        },
        {
          selector: "node[type='proxy']",
          style: {
            "background-color": "#EF4444",
            label: "data(label)",
            color: "#F1F5F9",
            "text-valign": "center",
            "font-size": 10,
            "border-width": 3,
            "border-color": "#EF4444",
            width: 40,
            height: 40,
          },
        },
        {
          selector: "node[type='protected_attr']",
          style: {
            "background-color": "#F59E0B",
            shape: "diamond",
            label: "data(label)",
            color: "#F1F5F9",
            "text-valign": "center",
            "font-size": 10,
            width: 45,
            height: 45,
          },
        },
        {
          selector: "node[type='outcome']",
          style: {
            "background-color": "#10B981",
            shape: "rectangle",
            label: "data(label)",
            color: "#F1F5F9",
            "text-valign": "center",
            "font-size": 10,
            width: 50,
            height: 35,
          },
        },
        {
          selector: "edge[edge_type='direct']",
          style: {
            "line-color": "#3B82F6",
            "target-arrow-color": "#3B82F6",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            width: "mapData(causal_strength, 0, 1, 1, 6)",
          },
        },
        {
          selector: "edge[edge_type='proxy']",
          style: {
            "line-color": "#EF4444",
            "target-arrow-color": "#EF4444",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            "line-style": "dashed",
            width: "mapData(causal_strength, 0, 1, 1, 6)",
          },
        },
        {
          selector: "edge[edge_type='interaction']",
          style: {
            "line-color": "#A78BFA",
            "target-arrow-color": "#A78BFA",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            "line-style": "dotted",
            width: "mapData(causal_strength, 0, 1, 1, 6)",
          },
        },
      ],
      userZoomingEnabled: true,
      userPanningEnabled: true,
    });

    cy.on("tap", "node", handleNodeTap);
    cy.fit(undefined, 30);
    cyRef.current = cy;

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [graphData, handleNodeTap]);

  if (!graphData) {
    return (
      <div className="nexus-card" style={{ textAlign: "center", padding: 40, color: "var(--text-dim)" }}>
        Run seed script to generate causal graph data.
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <div ref={containerRef} style={{ width: "100%", height: 500, borderRadius: "var(--radius)" }} />
      {/* Legend */}
      <div
        style={{
          position: "absolute",
          bottom: 12,
          left: 12,
          background: "rgba(5,11,24,0.9)",
          padding: "8px 12px",
          borderRadius: 8,
          fontSize: 11,
          display: "flex",
          gap: 12,
        }}
      >
        <span><span style={{ color: "#3B82F6" }}>●</span> Feature</span>
        <span><span style={{ color: "#EF4444" }}>●</span> Proxy</span>
        <span><span style={{ color: "#F59E0B" }}>◆</span> Protected</span>
        <span><span style={{ color: "#10B981" }}>■</span> Outcome</span>
      </div>
    </div>
  );
}
