import React from "react";
import { Network } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { Tooltip } from "@/components/ui/Tooltip";
import type { DiagramLinkTarget } from "@/lib/diagrams/links";

interface ShowOnDiagramButtonProps {
  identifier: string;
  /** The diagrams this asset is on. */
  placements: DiagramLinkTarget[];
  onShow: (placement: DiagramLinkTarget) => void;
}

/** Goes straight to the diagram, or asks which one when the asset is on several. */
export default function ShowOnDiagramButton({
  identifier,
  placements,
  onShow,
}: ShowOnDiagramButtonProps) {
  if (placements.length === 1) {
    return (
      <Tooltip content={`Show on ${placements[0].diagramName}`}>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onShow(placements[0])}
          aria-label={`Show ${identifier} on ${placements[0].diagramName}`}
        >
          <Network className="h-4 w-4" />
        </Button>
      </Tooltip>
    );
  }

  return (
    <DropdownMenu>
      <Tooltip content="Show on diagram">
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Show ${identifier} on a diagram`}>
            <Network className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align="end">
        {placements.map((placement) => (
          <DropdownMenuItem key={placement.diagramId} onClick={() => onShow(placement)}>
            {placement.diagramName}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
