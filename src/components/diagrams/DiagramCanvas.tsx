import React from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  ConnectionMode,
  ReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type FitViewOptions,
  type NodeChange,
  type OnDelete,
  type OnNodeDrag,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import DiagramSymbolNode from "@/components/diagrams/DiagramSymbolNode";
import { GRID } from "@/lib/diagrams/editing";
import type { DiagramNode } from "@/lib/diagrams/flowElements";

const NODE_TYPES = { diagramSymbol: DiagramSymbolNode };
const SNAP_GRID: [number, number] = [GRID, GRID];
const DELETE_KEYS = ["Delete", "Backspace"];
const CONNECTION_LINE_STYLE = { stroke: "#f26722", strokeWidth: 2 };
/** The library's credit has a pale background that shows as a gray box in dark mode. */
const CANVAS_STYLE = { "--xy-attribution-background-color": "transparent" } as React.CSSProperties;

/**
 * The top leaves room for the taskbar, so a source isn't hidden behind it, and the right
 * leaves room for labels. maxZoom stops a small diagram from filling the screen.
 */
export const FIT_VIEW_OPTIONS: FitViewOptions = {
  padding: { top: "120px", right: "100px", bottom: "32px", left: "32px" },
  maxZoom: 1.5,
};

interface DiagramCanvasProps {
  nodes: DiagramNode[];
  edges: Edge[];
  editing?: boolean;
  onNodesChange?: (changes: NodeChange<DiagramNode>[]) => void;
  onEdgesChange?: (changes: EdgeChange[]) => void;
  onConnect?: (connection: Connection) => void;
  onDelete?: OnDelete<DiagramNode, Edge>;
  onMoved?: (nodes: DiagramNode[]) => void;
  onSymbolClick?: (symbolId: string) => void;
  onBackgroundClick?: () => void;
  /** Off when the diagram opens centered on one symbol instead. */
  fitOnOpen?: boolean;
}

/** Drag to pan and scroll to zoom. Everything else only works while editing. */
export default function DiagramCanvas({
  nodes,
  edges,
  editing = false,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onDelete,
  onMoved,
  onSymbolClick,
  onBackgroundClick,
  fitOnOpen = true,
}: DiagramCanvasProps) {
  const handleNodeDragStop: OnNodeDrag<DiagramNode> = (_, __, dragged) => onMoved?.(dragged);

  return (
    <ReactFlow
      className="print:[&_.react-flow__attribution]:hidden"
      style={CANVAS_STYLE}
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      connectionMode={ConnectionMode.Loose}
      connectionLineType={ConnectionLineType.Step}
      connectionLineStyle={CONNECTION_LINE_STYLE}
      connectionRadius={24}
      fitView={fitOnOpen}
      fitViewOptions={FIT_VIEW_OPTIONS}
      minZoom={0.05}
      maxZoom={4}
      nodesDraggable={editing}
      nodesConnectable={editing}
      elementsSelectable={editing}
      snapToGrid
      snapGrid={SNAP_GRID}
      deleteKeyCode={editing ? DELETE_KEYS : null}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onDelete={onDelete}
      onNodeDragStop={handleNodeDragStop}
      onNodeClick={(_, node) => onSymbolClick?.(node.id)}
      onPaneClick={onBackgroundClick}
      onSelectionDragStop={(_, dragged) => onMoved?.(dragged as DiagramNode[])}
    >
      {editing && (
        <Background
          variant={BackgroundVariant.Dots}
          gap={GRID * 2}
          size={1}
          className="text-neutral-300 dark:text-neutral-700"
          color="currentColor"
        />
      )}
    </ReactFlow>
  );
}
