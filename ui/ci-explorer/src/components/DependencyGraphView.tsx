import { useMemo } from "react";
import { makeStyles, Text, tokens } from "@fluentui/react-components";
import type { DependencyGraph, GraphNode } from "../types";

const useStyles = makeStyles({
  root: {
    flex: 1,
    overflow: "auto",
    position: "relative",
    minHeight: "280px",
  },
  legend: {
    display: "flex",
    gap: "16px",
    marginBottom: "8px",
    flexWrap: "wrap",
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  emptyMsg: {
    textAlign: "center",
    padding: "32px",
    color: tokens.colorNeutralForeground3,
  },
});

// Layout constants
const NODE_W = 160;
const NODE_H = 48;
const H_GAP = 60;
const V_GAP = 24;
const PADDING = 20;

// Colours
const ROOT_FILL = "#0078d4";        // Fluent brand blue
const UPSTREAM_FILL = "#c239b3";    // Purple — things we depend on
const DOWNSTREAM_FILL = "#00b7c3";  // Teal — things depending on us
const STROKE_UP = "#c239b3";
const STROKE_DOWN = "#00b7c3";
const TEXT_COLOR = "#ffffff";

interface LayoutNode {
  id: string;
  label: string;
  subLabel: string;
  x: number;
  y: number;
  fill: string;
}

interface LayoutEdge {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  stroke: string;
}

function layoutGraph(graph: DependencyGraph) {
  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];

  const upNodes = Object.values(graph.upstream.nodes);
  const downNodes = Object.values(graph.downstream.nodes);

  // Column positions: upstream | root | downstream
  const colUp = PADDING;
  const colRoot = PADDING + (upNodes.length > 0 ? NODE_W + H_GAP : 0);
  const colDown = colRoot + NODE_W + H_GAP;

  // Root node — vertically centered
  const maxRows = Math.max(upNodes.length, downNodes.length, 1);
  const rootY = PADDING + ((maxRows - 1) * (NODE_H + V_GAP)) / 2;

  nodes.push({
    id: graph.root.sys_id,
    label: graph.root.name || graph.root.sys_id.slice(0, 8),
    subLabel: graph.root.sys_class_name || "",
    x: colRoot,
    y: rootY,
    fill: ROOT_FILL,
  });

  // Map of sys_id → position for edge drawing
  const posMap: Record<string, { x: number; y: number }> = {};
  posMap[graph.root.sys_id] = { x: colRoot, y: rootY };

  // Upstream nodes (left column)
  upNodes.forEach((node: GraphNode, i: number) => {
    const y = PADDING + i * (NODE_H + V_GAP);
    const id = node.sys_id;
    nodes.push({
      id,
      label: node.name || id.slice(0, 8),
      subLabel: node.sys_class_name || "",
      x: colUp,
      y,
      fill: UPSTREAM_FILL,
    });
    posMap[id] = { x: colUp, y };
  });

  // Downstream nodes (right column)
  downNodes.forEach((node: GraphNode, i: number) => {
    const y = PADDING + i * (NODE_H + V_GAP);
    const id = node.sys_id;
    nodes.push({
      id,
      label: node.name || id.slice(0, 8),
      subLabel: node.sys_class_name || "",
      x: colDown,
      y,
      fill: DOWNSTREAM_FILL,
    });
    posMap[id] = { x: colDown, y };
  });

  // Upstream edges (upstream node → root)
  graph.upstream.edges.forEach((e) => {
    const fromRaw = typeof e.from === "object" ? (e.from as Record<string, string>).value || "" : e.from;
    const toRaw = typeof e.to === "object" ? (e.to as Record<string, string>).value || "" : e.to;
    const fromPos = posMap[fromRaw] ?? posMap[toRaw];
    const toPos = posMap[toRaw] ?? posMap[fromRaw];
    if (fromPos && toPos) {
      edges.push({
        fromX: fromPos.x + NODE_W,
        fromY: fromPos.y + NODE_H / 2,
        toX: toPos.x,
        toY: toPos.y + NODE_H / 2,
        stroke: STROKE_UP,
      });
    }
  });

  // Downstream edges (root → downstream node)
  graph.downstream.edges.forEach((e) => {
    const fromRaw = typeof e.from === "object" ? (e.from as Record<string, string>).value || "" : e.from;
    const toRaw = typeof e.to === "object" ? (e.to as Record<string, string>).value || "" : e.to;
    const fromPos = posMap[fromRaw] ?? posMap[toRaw];
    const toPos = posMap[toRaw] ?? posMap[fromRaw];
    if (fromPos && toPos) {
      edges.push({
        fromX: fromPos.x + NODE_W,
        fromY: fromPos.y + NODE_H / 2,
        toX: toPos.x,
        toY: toPos.y + NODE_H / 2,
        stroke: STROKE_DOWN,
      });
    }
  });

  // Compute SVG viewBox
  const totalW =
    colDown + NODE_W + PADDING > colRoot + NODE_W + PADDING
      ? colDown + NODE_W + PADDING
      : colRoot + NODE_W + PADDING;
  const totalH = PADDING * 2 + maxRows * (NODE_H + V_GAP);

  return { nodes, edges, width: totalW, height: totalH };
}

interface Props {
  graph: DependencyGraph;
}

export function DependencyGraphView({ graph }: Props) {
  const classes = useStyles();

  const { nodes, edges, width, height } = useMemo(() => layoutGraph(graph), [graph]);

  const upCount = Object.keys(graph.upstream.nodes).length;
  const downCount = Object.keys(graph.downstream.nodes).length;

  if (upCount === 0 && downCount === 0) {
    return (
      <div className={classes.emptyMsg}>
        <Text italic>No dependencies found for this configuration item.</Text>
      </div>
    );
  }

  return (
    <div>
      <div className={classes.legend}>
        <span className={classes.legendItem}>
          <svg width="12" height="12"><rect width="12" height="12" rx="2" fill={UPSTREAM_FILL} /></svg>
          Upstream ({upCount}) — depends on
        </span>
        <span className={classes.legendItem}>
          <svg width="12" height="12"><rect width="12" height="12" rx="2" fill={ROOT_FILL} /></svg>
          Selected CI
        </span>
        <span className={classes.legendItem}>
          <svg width="12" height="12"><rect width="12" height="12" rx="2" fill={DOWNSTREAM_FILL} /></svg>
          Downstream ({downCount}) — depended on by
        </span>
      </div>

      <div className={classes.root}>
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          style={{ display: "block" }}
        >
          <defs>
            <marker
              id="arrowUp"
              markerWidth="8"
              markerHeight="6"
              refX="8"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 8 3, 0 6" fill={STROKE_UP} />
            </marker>
            <marker
              id="arrowDown"
              markerWidth="8"
              markerHeight="6"
              refX="8"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 8 3, 0 6" fill={STROKE_DOWN} />
            </marker>
          </defs>

          {/* Edges */}
          {edges.map((e, i) => {
            const midX = (e.fromX + e.toX) / 2;
            return (
              <path
                key={i}
                d={`M ${e.fromX} ${e.fromY} C ${midX} ${e.fromY}, ${midX} ${e.toY}, ${e.toX} ${e.toY}`}
                fill="none"
                stroke={e.stroke}
                strokeWidth="2"
                strokeOpacity="0.7"
                markerEnd={e.stroke === STROKE_UP ? "url(#arrowUp)" : "url(#arrowDown)"}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map((n) => (
            <g key={n.id}>
              <rect
                x={n.x}
                y={n.y}
                width={NODE_W}
                height={NODE_H}
                rx="6"
                fill={n.fill}
                opacity="0.9"
              />
              <text
                x={n.x + NODE_W / 2}
                y={n.y + 18}
                textAnchor="middle"
                fill={TEXT_COLOR}
                fontSize="12"
                fontWeight="600"
                fontFamily="Segoe UI, sans-serif"
              >
                {n.label.length > 18 ? n.label.slice(0, 17) + "…" : n.label}
              </text>
              {n.subLabel && (
                <text
                  x={n.x + NODE_W / 2}
                  y={n.y + 34}
                  textAnchor="middle"
                  fill={TEXT_COLOR}
                  fontSize="10"
                  opacity="0.8"
                  fontFamily="Segoe UI, sans-serif"
                >
                  {n.subLabel.length > 22 ? n.subLabel.slice(0, 21) + "…" : n.subLabel}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
