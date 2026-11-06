import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import type { DiagramLinkTarget, DiagramOverview } from "@/lib/diagrams/links";

interface DiagramOverviewDialogProps {
  open: boolean;
  overview: DiagramOverview[];
  activeDiagramId: string | null;
  onOpenDiagram: (diagramId: string) => void;
  onJump: (target: DiagramLinkTarget) => void;
  onClose: () => void;
}

/** Every diagram at the site and how they connect. */
export default function DiagramOverviewDialog({
  open,
  overview,
  activeDiagramId,
  onOpenDiagram,
  onJump,
  onClose,
}: DiagramOverviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="left-1/2 top-1/2 max-h-[85vh] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Site overview</DialogTitle>
        </DialogHeader>

        <ul className="divide-y divide-neutral-200 dark:divide-neutral-700">
          {overview.map(({ diagram, connections, unmatchedLinks }) => (
            <li key={diagram.id} className="py-3">
              <button
                type="button"
                className="font-medium text-brand hover:underline"
                onClick={() => onOpenDiagram(diagram.id)}
              >
                {diagram.name}
              </button>
              {diagram.id === activeDiagramId && (
                <span className="ml-2 text-xs text-neutral-500 dark:text-neutral-400">Open now</span>
              )}

              {connections.length === 0 && (
                <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                  Not connected to another diagram.
                </p>
              )}

              {connections.map((connection) => (
                <p key={connection.diagramId} className="mt-1 text-sm">
                  Connects to{" "}
                  <button
                    type="button"
                    className="text-brand hover:underline"
                    onClick={() => onJump(connection)}
                  >
                    {connection.diagramName}
                  </button>{" "}
                  <span className="text-neutral-500 dark:text-neutral-400">
                    through {connection.through.join(", ")}
                  </span>
                </p>
              ))}

              {unmatchedLinks.length > 0 && (
                <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                  No match on another diagram: {unmatchedLinks.join(", ")}
                </p>
              )}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
